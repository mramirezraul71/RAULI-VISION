# Capacitor / WebView (RAULI-VISION)
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
-keepattributes JavascriptInterface
-keep class com.getcapacitor.** { *; }
-keep class com.raulipanaderia.vision.** { *; }

# Preservar info para crash reports
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
