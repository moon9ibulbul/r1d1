package com.ridi.hook;

import android.content.Context;
import android.os.Build;
import android.webkit.ValueCallback;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.Set;
import java.util.WeakHashMap;

import de.robv.android.xposed.IXposedHookLoadPackage;
import de.robv.android.xposed.XC_MethodHook;
import de.robv.android.xposed.XposedBridge;
import de.robv.android.xposed.XposedHelpers;
import de.robv.android.xposed.callbacks.XC_LoadPackage;

public class MainHook implements IXposedHookLoadPackage {

    private static final String JS_INTERFACE_NAME = "RidiNativeBridge";
    private static final Set<WebView> hookedWebViews = Collections.newSetFromMap(new WeakHashMap<>());
    private static String cachedJsZip = null;
    private static String cachedInjectJs = null;

    @Override
    public void handleLoadPackage(XC_LoadPackage.LoadPackageParam lpparam) throws Throwable {
        // Target com.initialcoms.ridi or any related Ridibooks variants
        if (!isTargetPackage(lpparam.packageName)) {
            return;
        }

        XposedLogger.log("Loaded in target package: " + lpparam.packageName);

        hookWebView(lpparam);
    }

    private boolean isTargetPackage(String packageName) {
        if (packageName == null) return false;
        return packageName.contains("ridi") || packageName.equals("com.initialcoms.ridi") || packageName.equals("com.initialt.ridi");
    }

    private void hookWebView(XC_LoadPackage.LoadPackageParam lpparam) {
        try {
            // Hook WebView constructor to configure WebSettings and enable debugging
            XposedBridge.hookAllConstructors(WebView.class, new XC_MethodHook() {
                @Override
                protected void afterHookedMethod(MethodHookParam param) throws Throwable {
                    WebView webView = (WebView) param.thisObject;
                    initWebView(webView);
                }
            });

            // Hook WebView.setWebContentsDebuggingEnabled if available
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
                    WebView.setWebContentsDebuggingEnabled(true);
                    XposedLogger.log("Enabled WebView debugging globally");
                }
            } catch (Throwable t) {
                XposedLogger.log("Failed to setWebContentsDebuggingEnabled: " + t.getMessage());
            }

            // Hook WebView.loadUrl(String) to ensure scripts are injected or re-injected
            XposedHelpers.findAndHookMethod(
                    WebView.class,
                    "loadUrl",
                    String.class,
                    new XC_MethodHook() {
                        @Override
                        protected void beforeHookedMethod(MethodHookParam param) throws Throwable {
                            WebView webView = (WebView) param.thisObject;
                            initWebView(webView);
                        }
                    }
            );

            // Hook WebViewClient.onPageFinished
            XposedHelpers.findAndHookMethod(
                    WebViewClient.class,
                    "onPageFinished",
                    WebView.class,
                    String.class,
                    new XC_MethodHook() {
                        @Override
                        protected void afterHookedMethod(MethodHookParam param) throws Throwable {
                            WebView webView = (WebView) param.args[0];
                            String url = (String) param.args[1];
                            XposedLogger.log("onPageFinished: " + url);
                            injectScripts(webView);
                        }
                    }
            );

        } catch (Throwable t) {
            XposedLogger.log("Error hooking WebView methods: ", t);
        }
    }

    public static synchronized void initWebView(WebView webView) {
        if (webView == null) return;

        try {
            WebSettings settings = webView.getSettings();
            if (settings != null) {
                settings.setJavaScriptEnabled(true);
                settings.setDomStorageEnabled(true);
                settings.setAllowFileAccess(true);
                settings.setAllowContentAccess(true);
                settings.setDatabaseEnabled(true);
            }

            // Register native bridge interface
            if (!hookedWebViews.contains(webView)) {
                Context context = webView.getContext();
                webView.addJavascriptInterface(new WebAppInterface(context), JS_INTERFACE_NAME);
                hookedWebViews.add(webView);
                XposedLogger.log("Added JavascriptInterface '" + JS_INTERFACE_NAME + "' to WebView");
            }
        } catch (Throwable t) {
            XposedLogger.log("Error initializing WebView: ", t);
        }
    }

    public static void injectScripts(WebView webView) {
        if (webView == null) return;

        Context context = webView.getContext();
        if (context == null) return;

        // Run on UI Thread
        webView.post(() -> {
            try {
                initWebView(webView);

                String jszip = getAssetString(context, "jszip.js");
                String inject = getAssetString(context, "inject.js");

                if (jszip != null && !jszip.isEmpty()) {
                    evaluateJs(webView, jszip);
                }

                if (inject != null && !inject.isEmpty()) {
                    evaluateJs(webView, inject);
                }

                XposedLogger.log("Injected JSZip and Inject scripts into WebView");
            } catch (Throwable t) {
                XposedLogger.log("Failed to inject scripts: ", t);
            }
        });
    }

    private static void evaluateJs(WebView webView, String script) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
            webView.evaluateJavascript(script, null);
        } else {
            webView.loadUrl("javascript:" + script);
        }
    }

    public static String getAssetString(Context context, String filename) {
        try {
            if ("jszip.js".equals(filename) && cachedJsZip != null) {
                return cachedJsZip;
            }
            if ("inject.js".equals(filename) && cachedInjectJs != null) {
                return cachedInjectJs;
            }

            // In LSPatch / Xposed, assets might be in the module APK or host context.
            // Try loading from module resources or host assets.
            InputStream is = null;
            try {
                Context moduleContext = context.createPackageContext(
                        "com.ridi.hook",
                        Context.CONTEXT_IGNORE_SECURITY
                );
                is = moduleContext.getAssets().open(filename);
            } catch (Throwable ignored) {
            }

            if (is == null) {
                try {
                    is = context.getAssets().open(filename);
                } catch (Throwable ignored) {
                }
            }

            if (is == null) {
                // Try classloader resource
                is = MainHook.class.getClassLoader().getResourceAsStream("assets/" + filename);
            }

            if (is == null) {
                is = MainHook.class.getClassLoader().getResourceAsStream(filename);
            }

            if (is == null) {
                XposedLogger.log("Could not find asset: " + filename);
                return null;
            }

            StringBuilder sb = new StringBuilder();
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    sb.append(line).append('\n');
                }
            }
            String content = sb.toString();
            if ("jszip.js".equals(filename)) cachedJsZip = content;
            if ("inject.js".equals(filename)) cachedInjectJs = content;
            return content;
        } catch (Throwable t) {
            XposedLogger.log("Error reading asset " + filename + ": ", t);
            return null;
        }
    }
}
