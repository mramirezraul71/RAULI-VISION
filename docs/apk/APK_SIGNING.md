
# APK Signing (Android)

## Requisitos
- Flutter stable
- Java JDK 17
- keystore (.jks)

## Pasos
1) flutter build apk --release
2) Generar keystore:
   keytool -genkey -v -keystore cubastealth.jks -keyalg RSA -keysize 2048 -validity 10000 -alias cubastealth
3) Configurar key.properties (NO versionar):
   storePassword=***
   keyPassword=***
   keyAlias=cubastealth
   storeFile=/path/cubastealth.jks
4) firmar:
   apksigner sign --ks cubastealth.jks app-release.apk
5) Verificar:
   apksigner verify app-release.apk

Notas:
- Mantener keystore fuera del repositorio.
