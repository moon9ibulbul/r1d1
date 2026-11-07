package com.ridi.hook;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.widget.Toast;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

public class WebAppInterface {

    private final Context context;
    private final Handler mainHandler;

    public WebAppInterface(Context context) {
        this.context = context;
        this.mainHandler = new Handler(Looper.getMainLooper());
    }

    @JavascriptInterface
    public void showToast(String message) {
        mainHandler.post(() -> {
            try {
                Toast.makeText(context, "[RidiHook] " + message, Toast.LENGTH_SHORT).show();
            } catch (Throwable t) {
                // Ignore if context is unavailable
            }
        });
    }

    @JavascriptInterface
    public void log(String message) {
        XposedLogger.log("[JS Log] " + message);
    }

    @JavascriptInterface
    public void logError(String message) {
        XposedLogger.log("[JS Error] " + message);
    }

    @JavascriptInterface
    public boolean saveBase64File(String base64Data, String filename, String mimeType) {
        try {
            if (base64Data == null || filename == null) {
                showToast("Failed to save: data is empty");
                return false;
            }

            // Remove data URI prefix if present (e.g. data:application/epub+zip;base64,...)
            int commaIdx = base64Data.indexOf(',');
            String rawBase64 = commaIdx >= 0 ? base64Data.substring(commaIdx + 1) : base64Data;
            byte[] fileBytes = Base64.decode(rawBase64, Base64.DEFAULT);

            boolean success = saveBytesToDownload(fileBytes, filename, mimeType);
            if (success) {
                showToast("Saved: " + filename + " to Downloads");
            } else {
                showToast("Failed to save " + filename);
            }
            return success;
        } catch (Throwable t) {
            XposedLogger.log("Error saving base64 file: " + t.getMessage());
            showToast("Error saving: " + t.getMessage());
            return false;
        }
    }

    public boolean saveBytesToDownload(byte[] bytes, String filename, String mimeType) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentValues values = new ContentValues();
                values.put(MediaStore.MediaColumns.DISPLAY_NAME, filename);
                if (mimeType != null && !mimeType.isEmpty()) {
                    values.put(MediaStore.MediaColumns.MIME_TYPE, mimeType);
                }
                values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/RidiBooks");

                ContentResolver resolver = context.getContentResolver();
                Uri uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                if (uri == null) {
                    return false;
                }

                try (OutputStream os = resolver.openOutputStream(uri)) {
                    if (os != null) {
                        os.write(bytes);
                        os.flush();
                        return true;
                    }
                }
                return false;
            } else {
                File dir = new File(
                        Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS),
                        "RidiBooks"
                );
                if (!dir.exists()) {
                    dir.mkdirs();
                }
                File destFile = new File(dir, filename);
                try (FileOutputStream fos = new FileOutputStream(destFile)) {
                    fos.write(bytes);
                    fos.flush();
                    return true;
                }
            }
        } catch (Throwable t) {
            XposedLogger.log("saveBytesToDownload exception: " + t.getMessage());
            return false;
        }
    }
}
