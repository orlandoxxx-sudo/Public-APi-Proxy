import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  PutCommandInput,
  QueryCommandInput
} from '@aws-sdk/lib-dynamodb';
import { RateDay } from './types';

let documentClient: DynamoDBDocumentClient | undefined;

function getDocumentClient(): DynamoDBDocumentClient {
  if (!documentClient) {
    const client = new DynamoDBClient({});
    documentClient = DynamoDBDocumentClient.from(client, {
      marshallOptions: { removeUndefinedValues: true }
    });
  }
  return documentClient;
}

export function __setDocumentClient(client: DynamoDBDocumentClient): void {
  documentClient = client;
}

export async function putRateDay(tableName: string, item: RateDay): Promise<void> {
  const params: PutCommandInput = {
    TableName: tableName,
    Item: {
      PK: item.pk,
      SK: item.sk,
      rates: item.rates,
      sourceTs: item.sourceTs,
      lastGoodFetchAt: item.lastGoodFetchAt,
      ttl: item.ttl
    }
  };
  await getDocumentClient().send(new PutCommand(params));
}

export interface DateRangeQueryInput {
  tableName: string;
  base: string;
  startIsoDate: string; // YYYY-MM-DD
  endIsoDate: string; // YYYY-MM-DD
}

export async function queryByDateRange({
  tableName,
  base,
  startIsoDate,
  endIsoDate
}: DateRangeQueryInput): Promise<RateDay[]> {
  const params: QueryCommandInput = {
    TableName: tableName,
    KeyConditionExpression: 'PK = :pk AND SK BETWEEN :start AND :end',
    ExpressionAttributeValues: {
      ':pk': `RATES#${base}`,
      ':start': `DATE#${startIsoDate}`,
      ':end': `DATE#${endIsoDate}`
    },
    ScanIndexForward: true
  };

  const response = await getDocumentClient().send(new QueryCommand(params));
  const items = response.Items ?? [];
  return items.map((item) => ({
    pk: item.PK as string,
    sk: item.SK as string,
    rates: item.rates as Record<string, number>,
    sourceTs: item.sourceTs as string,
    lastGoodFetchAt: item.lastGoodFetchAt as string,
    ttl: item.ttl as number | undefined
  }));
}

export async function queryLatestRateDay(tableName: string, base: string): Promise<RateDay | null> {
  const params = {
    TableName: tableName,
    KeyConditionExpression: 'PK = :pk',
    ExpressionAttributeValues: {
      ':pk': `RATES#${base}`
    },
    Limit: 1,
    ScanIndexForward: false
  };

  const response = await getDocumentClient().send(new QueryCommand(params));
  const item = response.Items?.[0];
  if (!item) {
    return null;
  }
  return {
    pk: item.PK as string,
    sk: item.SK as string,
    rates: item.rates as Record<string, number>,
    sourceTs: item.sourceTs as string,
    lastGoodFetchAt: item.lastGoodFetchAt as string,
    ttl: item.ttl as number | undefined
  };
}

export interface IncrementBudgetInput {
  tableName: string;
  budget: number;
  today: string; // YYYY-MM-DD
}

export async function incrementDailyBudgetCounter({
  tableName,
  budget,
  today
}: IncrementBudgetInput): Promise<{ count: number } | null> {
  const params = {
    TableName: tableName,
    Key: {
      PK: 'BUDGET#DAILY',
      SK: `DATE#${today}`
    },
    UpdateExpression: 'ADD #count :inc',
    ExpressionAttributeNames: {
      '#count': 'count'
    },
    ExpressionAttributeValues: {
      ':inc': 1,
      ':budget': budget
    },
    ConditionExpression: 'attribute_not_exists(#count) OR #count < :budget',
    ReturnValues: 'ALL_NEW'
  } as const;

  try {
    const response = await getDocumentClient().send(new UpdateCommand(params));
    const count = (response.Attributes?.count as number) ?? 0;
    return { count };
  } catch (error) {
    const err = error as { name?: string };
    if (err.name === 'ConditionalCheckFailedException') {
      return null;
    }
    throw error;
  }
}
