import * as path from 'path';
import { Duration, RemovalPolicy, Stack, StackProps, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambdaNode from 'aws-cdk-lib/aws-lambda-nodejs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as appsync from 'aws-cdk-lib/aws-appsync';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subs from 'aws-cdk-lib/aws-sns-subscriptions';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cwActions from 'aws-cdk-lib/aws-cloudwatch-actions';

export interface FxProxyStackProps extends StackProps {
  readonly alarmEmail?: string;
}

export class FxProxyStack extends Stack {
  constructor(scope: Construct, id: string, props: FxProxyStackProps = {}) {
    super(scope, id, props);

    const table = new dynamodb.Table(this, 'FxRatesTable', {
      tableName: 'FxRates',
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.RETAIN,
      timeToLiveAttribute: 'ttl',
      pointInTimeRecovery: true,
      encryption: dynamodb.TableEncryption.AWS_MANAGED
    });

    table.addGlobalSecondaryIndex({
      indexName: 'GSI1',
      partitionKey: { name: 'GSI1PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'GSI1SK', type: dynamodb.AttributeType.STRING }
    });

    const symbolsParam = new ssm.StringParameter(this, 'SymbolsParam', {
      parameterName: '/fxproxy/SYMBOLS',
      stringValue: 'USD,EUR,GBP,NGN,GHS'
    });

    const baseParam = new ssm.StringParameter(this, 'BaseParam', {
      parameterName: '/fxproxy/BASE',
      stringValue: 'USD'
    });

    const publicApiParam = new ssm.StringParameter(this, 'PublicApiParam', {
      parameterName: '/fxproxy/PUBLIC_API_URL',
      stringValue: 'https://example.com/rates'
    });

    const budgetParam = new ssm.StringParameter(this, 'BudgetParam', {
      parameterName: '/fxproxy/DAILY_API_CALL_BUDGET',
      stringValue: '200'
    });

    const cacheTtlParam = new ssm.StringParameter(this, 'CacheTtlParam', {
      parameterName: '/fxproxy/CACHE_TTL_SECONDS',
      stringValue: '300'
    });

    const cacheTtlSeconds = Number(cacheTtlParam.stringValue);

    const ingestFunction = new lambdaNode.NodejsFunction(this, 'IngestFunction', {
      entry: path.join(__dirname, '../../services/ingest/src/handler.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      memorySize: 512,
      timeout: Duration.seconds(30),
      environment: {
        TABLE_NAME: table.tableName
      },
      bundling: {
        minify: true,
        sourcesContent: false,
        target: 'node20',
        nodeModules: ['@fxproxy/shared']
      }
    });

    table.grantReadWriteData(ingestFunction);
    symbolsParam.grantRead(ingestFunction);
    baseParam.grantRead(ingestFunction);
    publicApiParam.grantRead(ingestFunction);
    budgetParam.grantRead(ingestFunction);
    cacheTtlParam.grantRead(ingestFunction);

    const apiFunction = new lambdaNode.NodejsFunction(this, 'ApiFunction', {
      entry: path.join(__dirname, '../../services/api/src/handler.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      memorySize: 512,
      timeout: Duration.seconds(30),
      environment: {
        TABLE_NAME: table.tableName
      },
      bundling: {
        minify: true,
        sourcesContent: false,
        target: 'node20',
        nodeModules: ['@fxproxy/shared']
      }
    });

    table.grantReadData(apiFunction);
    symbolsParam.grantRead(apiFunction);
    baseParam.grantRead(apiFunction);
    publicApiParam.grantRead(apiFunction);
    budgetParam.grantRead(apiFunction);
    cacheTtlParam.grantRead(apiFunction);

    const rule = new events.Rule(this, 'HourlyIngestRule', {
      schedule: events.Schedule.cron({ minute: '0', hour: '0/1' })
    });
    rule.addTarget(new targets.LambdaFunction(ingestFunction));

    const api = new appsync.GraphqlApi(this, 'FxGraphqlApi', {
      name: 'FxProxyApi',
      schema: appsync.SchemaFile.fromAsset(path.join(__dirname, '../assets/schema.graphql')),
      authorizationConfig: {
        defaultAuthorization: {
          authorizationType: appsync.AuthorizationType.API_KEY,
          apiKeyConfig: {
            expires: appsync.Expiration.after(Duration.days(365))
          }
        }
      },
      logConfig: {
        fieldLogLevel: appsync.FieldLogLevel.ERROR
      },
      xrayEnabled: true
    });

    const apiKey = api.addApiKey('FxProxyApiKey', {
      expires: appsync.Expiration.after(Duration.days(365))
    });

    const dataSource = api.addLambdaDataSource('LambdaDatasource', apiFunction);

    dataSource.createResolver('GetLatestResolver', {
      typeName: 'Query',
      fieldName: 'getLatest',
      cachingConfig: {
        ttl: Duration.seconds(cacheTtlSeconds).toSeconds(),
        cachingKeys: ['$context.arguments.base', '$context.arguments.symbols']
      }
    });

    dataSource.createResolver('GetHistoryResolver', {
      typeName: 'Query',
      fieldName: 'getHistory',
      cachingConfig: {
        ttl: Duration.seconds(cacheTtlSeconds).toSeconds(),
        cachingKeys: ['$context.arguments.base', '$context.arguments.symbol', '$context.arguments.days']
      }
    });

    new appsync.CfnApiCache(this, 'ApiCache', {
      apiId: api.apiId,
      ttl: cacheTtlSeconds,
      type: 'SMALL',
      apiCachingBehavior: 'FULL_REQUEST_CACHING'
    });

    const topic = new sns.Topic(this, 'BudgetAlarmTopic', {
      displayName: 'FX Proxy Budget Alerts'
    });

    if (props.alarmEmail) {
      topic.addSubscription(new subs.EmailSubscription(props.alarmEmail));
    }

    const budgetThreshold = Number(budgetParam.stringValue);

    const externalCallMetric = new cloudwatch.Metric({
      namespace: 'FxProxy',
      metricName: 'ExternalCalls',
      period: Duration.hours(1),
      statistic: 'sum'
    });

    new cloudwatch.Alarm(this, 'ExternalCallAlarm', {
      metric: externalCallMetric,
      threshold: budgetThreshold,
      evaluationPeriods: 24,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      alarmDescription: 'External call budget exceeded in 24h'
    }).addAlarmAction(new cwActions.SnsAction(topic));

    const dashboard = new cloudwatch.Dashboard(this, 'FxProxyDashboard', {
      dashboardName: 'FxProxyDashboard'
    });

    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Ingest Lambda Errors',
        left: [ingestFunction.metricErrors({ period: Duration.minutes(5) })]
      }),
      new cloudwatch.GraphWidget({
        title: 'API Lambda Errors',
        left: [apiFunction.metricErrors({ period: Duration.minutes(5) })]
      })
    );

    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'DynamoDB Throttles',
        left: [table.metricThrottledRequests({ period: Duration.minutes(5) })]
      }),
      new cloudwatch.GraphWidget({
        title: 'External API Calls',
        left: [externalCallMetric]
      })
    );

    new CfnOutput(this, 'GraphqlUrl', {
      value: api.graphqlUrl
    });

    new CfnOutput(this, 'GraphqlApiKey', {
      value: apiKey.attrApiKey
    });

    new CfnOutput(this, 'WebEnvHint', {
      value: `VITE_APPSYNC_API_URL=${api.graphqlUrl};VITE_APPSYNC_API_KEY=${apiKey.attrApiKey}`
    });
  }
}
