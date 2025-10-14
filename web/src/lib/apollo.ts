import { ApolloClient, InMemoryCache, createHttpLink } from '@apollo/client/core';

const httpLink = createHttpLink({
  uri: import.meta.env.VITE_APPSYNC_API_URL,
  headers: {
    'x-api-key': import.meta.env.VITE_APPSYNC_API_KEY
  }
});

export const apolloClient = new ApolloClient({
  link: httpLink,
  cache: new InMemoryCache()
});
