package com.ridi.hook;

import android.util.Log;

public class XposedLogger {
    private static final String TAG = "RidiHook";

    public static void log(String message) {
        try {
            de.robv.android.xposed.XposedBridge.log("[" + TAG + "] " + message);
        } catch (Throwable t) {
            Log.d(TAG, message);
        }
    }

    public static void log(String message, Throwable tr) {
        try {
            de.robv.android.xposed.XposedBridge.log("[" + TAG + "] " + message);
            de.robv.android.xposed.XposedBridge.log(tr);
        } catch (Throwable t) {
            Log.e(TAG, message, tr);
        }
    }
}
