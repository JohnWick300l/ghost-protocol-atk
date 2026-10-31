
package com.ghostprotocol.atk;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebChromeClient;
import android.webkit.WebViewClient;

import androidx.activity.OnBackPressedCallback;
import androidx.appcompat.app.AppCompatActivity;

public class MainActivity extends AppCompatActivity {

    private WebView webView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        webView = new WebView(this);

        WebSettings webSettings = webView.getSettings();
        webSettings.setJavaScriptEnabled(true);
        webSettings.setDomStorageEnabled(true);
        webSettings.setAllowFileAccess(true);
        webSettings.setAllowContentAccess(true);
        webSettings.setSupportMultipleWindows(false);
        webSettings.setJavaScriptCanOpenWindowsAutomatically(false);

        webView.setWebViewClient(new WebViewClient() {

            @Override
            public boolean shouldOverrideUrlLoading(
                    WebView view, WebResourceRequest request) {
                return handleNavigation(request.getUrl().toString());
            }

            @Override
            public boolean shouldOverrideUrlLoading(
                    WebView view, String url) {
                return handleNavigation(url);
            }
        });

        webView.loadUrl("https://ghost-protocol.ai.studio");

        setContentView(webView);

        getOnBackPressedDispatcher().addCallback(
                this,
                new OnBackPressedCallback(true) {
                    @Override
                    public void handleOnBackPressed() {
                        if (webView != null && webView.canGoBack()) {
                            webView.goBack();
                        } else {
                            setEnabled(false);
                            getOnBackPressedDispatcher().onBackPressed();
                        }
                    }
                }
        );
    }

    private boolean handleNavigation(String url) {

        if (url == null) {
            return false;
        }

        // Handle Google Maps intent links.
        if (url.startsWith("intent://")) {

            try {
                Intent mapIntent = Intent.parseUri(
                        url, Intent.URI_INTENT_SCHEME);

                String fallbackUrl =
                        mapIntent.getStringExtra("browser_fallback_url");

                try {
                    startActivity(mapIntent);
                    return true;

                } catch (ActivityNotFoundException e) {

                    if (fallbackUrl != null &&
                            !fallbackUrl.isEmpty()) {
                        openInBrowser(fallbackUrl);
                        return true;
                    }

                    String webUrl = url
                            .replaceFirst("^intent://", "https://")
                            .replaceFirst("#Intent;.*$", "");

                    openInBrowser(webUrl);
                    return true;
                }

            } catch (Exception e) {
                return true;
            }
        }

        // Open Google Maps HTTPS links outside the WebView.
        Uri uri = Uri.parse(url);
        String host = uri.getHost();

        if (host != null &&
                (host.equalsIgnoreCase("maps.google.com") ||
                 host.equalsIgnoreCase("www.google.com") ||
                 host.equalsIgnoreCase("google.com"))) {

            String path = uri.getPath();

            if (path != null && path.startsWith("/maps")) {
                try {
                    Intent mapsIntent = new Intent(
                            Intent.ACTION_VIEW, uri);
                    mapsIntent.setPackage(
                            "com.google.android.apps.maps");

                    startActivity(mapsIntent);
                    return true;

                } catch (ActivityNotFoundException e) {
                    openInBrowser(url);
                    return true;
                }
            }
        }

        return false;
    }

    private void openInBrowser(String url) {
        try {
            Intent browserIntent = new Intent(
                    Intent.ACTION_VIEW, Uri.parse(url));
            startActivity(browserIntent);
        } catch (Exception ignored) {
            // No compatible browser available.
        }
    }
}
