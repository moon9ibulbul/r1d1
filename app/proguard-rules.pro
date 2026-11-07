# Proguard rules for RidiHook Xposed module
-keep class com.ridi.hook.** { *; }
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
