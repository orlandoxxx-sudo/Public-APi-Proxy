import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

const tableName = process.env.TABLE_NAME ?? 'FxRates';
const base = process.env.BASE ?? 'USD';
const symbols = (process.env.SYMBOLS ?? 'EUR,GBP,NGN,GHS').split(',').map((s) => s.trim());

const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION ?? 'us-east-1' }), {
  marshallOptions: { removeUndefinedValues: true }
});

async function seed(): Promise<void> {
  const now = new Date();
  for (let i = 0; i < 7; i += 1) {
    const date = new Date(now);
    date.setUTCDate(now.getUTCDate() - i);
    const isoDate = date.toISOString().slice(0, 10);
    const rates: Record<string, number> = {};
    symbols.forEach((symbol, index) => {
      rates[symbol] = Number((1 + index * 0.1 + Math.random() * 0.01).toFixed(4));
    });

    await client.send(
      new PutCommand({
        TableName: tableName,
        Item: {
          PK: `RATES#${base}`,
          SK: `DATE#${isoDate}`,
          rates,
          sourceTs: `${isoDate}T00:00:00Z`,
          lastGoodFetchAt: new Date().toISOString()
        }
      })
    );
  }

  // budget counter reset for today
  const today = new Date().toISOString().slice(0, 10);
  await client.send(
    new PutCommand({
      TableName: tableName,
      Item: {
        PK: 'BUDGET#DAILY',
        SK: `DATE#${today}`,
        count: 0
      }
    })
  );

  console.log('Seeded sample FX data');
}

seed().catch((error) => {
  console.error(error);
  process.exit(1);
});
