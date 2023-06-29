// A custom App component where you can add global styles and state.
import React from 'react';
import { AppProps } from 'next/app';

function MyApp({ Component, pageProps }: AppProps) {
    return <Component {...pageProps} />
}

export default MyApp;
// The App component is the top-level component which will be common across all the different pages.
// You can use this App component to keep state when navigating between pages, for example.
// The App component is also useful for loading CSS or other common components such as a navigation bar or footer.