
package com.ghostprotocol.atk;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Bundle;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.ValueCallback;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebChromeClient;
import android.webkit.WebViewClient;

import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;

public class MainActivity extends AppCompatActivity {

    private WebView webView;
    private ValueCallback<Uri[]> fileUploadCallback;

    private final ActivityResultLauncher<Intent> fileChooserLauncher =
            registerForActivityResult(
                    new ActivityResultContracts.StartActivityForResult(),
                    result -> {
                        Uri[] results = null;
                        List<String> base64Images = new ArrayList<>();

                        if (result.getResultCode() == Activity.RESULT_OK && result.getData() != null) {
                            Intent data = result.getData();
                            ClipData clipData = data.getClipData();
                            if (clipData != null && clipData.getItemCount() > 0) {
                                results = new Uri[clipData.getItemCount()];
                                for (int i = 0; i < clipData.getItemCount(); i++) {
                                    results[i] = clipData.getItemAt(i).getUri();
                                }
                            } else if (data.getData() != null) {
                                results = new Uri[]{data.getData()};
                            } else if (data.getExtras() != null && data.getExtras().get("data") instanceof Bitmap) {
                                Bitmap capturedBitmap = (Bitmap) data.getExtras().get("data");
                                String dataUrl = encodeBitmapToDataUrl(capturedBitmap);
                                if (dataUrl != null) {
                                    base64Images.add(dataUrl);
                                }
                            } else {
                                results = WebChromeClient.FileChooserParams.parseResult(
                                        result.getResultCode(), data);
                            }
                        }

                        if (results != null && results.length > 0) {
                            for (Uri uri : results) {
                                String dataUrl = readUriToDataUrl(uri);
                                if (dataUrl != null) {
                                    base64Images.add(dataUrl);
                                }
                            }
                        }

                        if (fileUploadCallback != null) {
                            fileUploadCallback.onReceiveValue(results);
                            fileUploadCallback = null;
                        }

                        if (!base64Images.isEmpty() && webView != null) {
                            StringBuilder jsArray = new StringBuilder("[");
                            for (int i = 0; i < base64Images.size(); i++) {
                                if (i > 0) jsArray.append(",");
                                jsArray.append("\"").append(base64Images.get(i)).append("\"");
                            }
                            jsArray.append("]");
                            final String script =
                                    "(function(){" +
                                    "var imgs=" + jsArray + ";" +
                                    "var tgt='modifications';" +
                                    "try{tgt=localStorage.getItem('ghost_active_photo_target')||'modifications';}catch(e){}" +
                                    "try{localStorage.setItem('ghost_native_pending_photos',JSON.stringify(imgs));}catch(e){}" +
                                    "try{localStorage.setItem('ghost_current_mod_photos',JSON.stringify(imgs));}catch(e){}" +
                                    "try{window.__ghostPendingNativePhotos=imgs;}catch(e){}" +
                                    "if(window.__ghostReceiveNativePhotos){window.__ghostReceiveNativePhotos(imgs);}" +
                                    "try{window.dispatchEvent(new CustomEvent('ghost-native-photos',{detail:{images:imgs,target:tgt}}));}catch(e){}" +
                                    "try{fetch('/api/photo-bridge/native_direct',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({images:imgs,target:tgt})});}catch(e){}" +
                                    "})();";
                            webView.post(() -> webView.evaluateJavascript(script, null));

                            final List<String> imagesToSync = new ArrayList<>(base64Images);
                            new Thread(() -> {
                                try {
                                    java.net.URL url = new java.net.URL("https://ais-pre-77hkzinvn4bzftnkgkf7mt-729473993784.asia-northeast1.run.app/api/photo-bridge/native_direct");
                                    java.net.HttpURLConnection conn = (java.net.HttpURLConnection) url.openConnection();
                                    conn.setRequestMethod("POST");
                                    conn.setRequestProperty("Content-Type", "application/json; utf-8");
                                    conn.setDoOutput(true);
                                    conn.setConnectTimeout(6000);
                                    conn.setReadTimeout(6000);
                                    StringBuilder payload = new StringBuilder("{\"target\":\"modifications\",\"images\":[");
                                    for (int i = 0; i < imagesToSync.size(); i++) {
                                        if (i > 0) payload.append(",");
                                        payload.append("\"").append(imagesToSync.get(i)).append("\"");
                                    }
                                    payload.append("]}");
                                    byte[] postData = payload.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8);
                                    conn.setFixedLengthStreamingMode(postData.length);
                                    try (java.io.OutputStream os = conn.getOutputStream()) {
                                        os.write(postData);
                                    }
                                    conn.getResponseCode();
                                    conn.disconnect();
                                } catch (Throwable ignored) {}
                            }).start();
                        }
                    }
            );

    private String encodeBitmapToDataUrl(Bitmap bitmap) {
        if (bitmap == null) return null;
        try {
            int maxDim = 1024;
            int width = bitmap.getWidth();
            int height = bitmap.getHeight();
            if (width > maxDim || height > maxDim) {
                if (width > height) {
                    height = Math.max(1, Math.round((float) height * maxDim / width));
                    width = maxDim;
                } else {
                    width = Math.max(1, Math.round((float) width * maxDim / height));
                    height = maxDim;
                }
                bitmap = Bitmap.createScaledBitmap(bitmap, width, height, true);
            }
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            bitmap.compress(Bitmap.CompressFormat.JPEG, 80, baos);
            String base64 = Base64.encodeToString(baos.toByteArray(), Base64.NO_WRAP);
            return "data:image/jpeg;base64," + base64;
        } catch (Throwable e) {
            return null;
        }
    }

    private String readUriToDataUrl(Uri uri) {
        if (uri == null) return null;
        try (InputStream is = getContentResolver().openInputStream(uri)) {
            if (is == null) return null;
            ByteArrayOutputStream buffer = new ByteArrayOutputStream();
            byte[] chunk = new byte[16384];
            int nRead;
            while ((nRead = is.read(chunk, 0, chunk.length)) != -1) {
                buffer.write(chunk, 0, nRead);
            }
            byte[] rawBytes = buffer.toByteArray();
            if (rawBytes.length == 0) return null;

            BitmapFactory.Options boundsOpts = new BitmapFactory.Options();
            boundsOpts.inJustDecodeBounds = true;
            BitmapFactory.decodeByteArray(rawBytes, 0, rawBytes.length, boundsOpts);

            int sampleSize = 1;
            int maxSourceDim = Math.max(boundsOpts.outWidth, boundsOpts.outHeight);
            while (maxSourceDim / sampleSize > 1600) {
                sampleSize *= 2;
            }

            BitmapFactory.Options decodeOpts = new BitmapFactory.Options();
            decodeOpts.inSampleSize = sampleSize;
            Bitmap bitmap = BitmapFactory.decodeByteArray(rawBytes, 0, rawBytes.length, decodeOpts);
            if (bitmap != null) {
                String encoded = encodeBitmapToDataUrl(bitmap);
                if (encoded != null) return encoded;
            }

            String fallbackBase64 = Base64.encodeToString(rawBytes, Base64.NO_WRAP);
            return "data:image/jpeg;base64," + fallbackBase64;
        } catch (Throwable e) {
            return null;
        }
    }

    private void launchNativeMediaChooser(Intent baseIntent) {
        try {
            baseIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            Intent chooser = Intent.createChooser(baseIntent, "Select Photos From Device");
            chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            fileChooserLauncher.launch(chooser);
        } catch (ActivityNotFoundException e) {
            if (fileUploadCallback != null) {
                fileUploadCallback.onReceiveValue(null);
                fileUploadCallback = null;
            }
        }
    }

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

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(
                    WebView webView,
                    ValueCallback<Uri[]> filePathCallback,
                    FileChooserParams fileChooserParams) {
                if (fileUploadCallback != null) {
                    fileUploadCallback.onReceiveValue(null);
                    fileUploadCallback = null;
                }
                fileUploadCallback = filePathCallback;

                Intent contentSelectionIntent;
                if (fileChooserParams != null && fileChooserParams.isCaptureEnabled()) {
                    contentSelectionIntent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
                } else {
                    contentSelectionIntent = new Intent(Intent.ACTION_GET_CONTENT);
                    contentSelectionIntent.addCategory(Intent.CATEGORY_OPENABLE);
                    contentSelectionIntent.setType("image/*");
                    contentSelectionIntent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                }

                launchNativeMediaChooser(contentSelectionIntent);
                return true;
            }
        });

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

        webView.loadUrl("https://ais-pre-77hkzinvn4bzftnkgkf7mt-729473993784.asia-northeast1.run.app");

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

        // Handle intent:// links (Native Media/Photos/Files/Camera, Google Maps, UPI App, GPay, PhonePe, Paytm).
        if (url.startsWith("intent://")) {

            try {
                Intent parsedIntent = Intent.parseUri(
                        url, Intent.URI_INTENT_SCHEME);

                String action = parsedIntent.getAction();
                String mimeType = parsedIntent.getType();

                // Direct phone Media / Photos / Files / Camera picker intent (clean Intent without intent:// data URI)
                if (MediaStore.ACTION_IMAGE_CAPTURE.equals(action)) {
                    Intent cameraIntent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
                    launchNativeMediaChooser(cameraIntent);
                    return true;
                }
                if (Intent.ACTION_GET_CONTENT.equals(action) ||
                        Intent.ACTION_PICK.equals(action) ||
                        Intent.ACTION_OPEN_DOCUMENT.equals(action) ||
                        (mimeType != null && mimeType.startsWith("image/"))) {
                    Intent pickIntent = new Intent(Intent.ACTION_GET_CONTENT);
                    pickIntent.addCategory(Intent.CATEGORY_OPENABLE);
                    pickIntent.setType("image/*");
                    pickIntent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                    launchNativeMediaChooser(pickIntent);
                    return true;
                }

                String fallbackUrl =
                        parsedIntent.getStringExtra("browser_fallback_url");

                try {
                    startActivity(parsedIntent);
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

                    if (!webUrl.equals("https://") && !webUrl.isEmpty()) {
                        openInBrowser(webUrl);
                    }
                    return true;
                }

            } catch (Exception e) {
                return true;
            }
        }

        // Handle direct phone dialer, email, SMS, and WhatsApp schemes outside the WebView.
        if (url.startsWith("tel:")) {
            try {
                Intent dialIntent = new Intent(
                        Intent.ACTION_DIAL, Uri.parse(url));
                startActivity(dialIntent);
                return true;
            } catch (Exception e) {
                openInBrowser(url);
                return true;
            }
        }

        if (url.startsWith("mailto:") ||
                url.startsWith("sms:") ||
                url.startsWith("smsto:") ||
                url.startsWith("whatsapp://")) {
            try {
                Intent externalIntent = new Intent(
                        Intent.ACTION_VIEW, Uri.parse(url));
                startActivity(externalIntent);
                return true;
            } catch (Exception e) {
                return true;
            }
        }

        // Handle direct UPI and external payment schemes outside the WebView.
        if (url.startsWith("upi://") ||
                url.startsWith("tez://") ||
                url.startsWith("gpay://") ||
                url.startsWith("phonepe://") ||
                url.startsWith("paytmmp://") ||
                url.startsWith("bhim://")) {
            try {
                Intent upiIntent = new Intent(
                        Intent.ACTION_VIEW, Uri.parse(url));
                startActivity(upiIntent);
                return true;
            } catch (ActivityNotFoundException e) {
                int queryIdx = url.indexOf('?');
                if (queryIdx >= 0 && !url.startsWith("upi://")) {
                    openInBrowser("upi://pay" + url.substring(queryIdx));
                }
                return true;
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
