import 'dotenv/config';
import { App } from 'aws-cdk-lib';
import { FxProxyStack } from './fx-proxy-stack';

const app = new App();

new FxProxyStack(app, 'FxProxyStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION
  },
  alarmEmail: process.env.FX_PROXY_ALARM_EMAIL
});
