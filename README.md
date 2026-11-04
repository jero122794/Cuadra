# Cuadra

Rompecabezas de bloques para **web, Android e iOS** desde una sola base de código. Arrastra piezas a un tablero de 8x8, completa filas y columnas, supera 30 niveles y desbloquea los modos extremos.

## Modos de juego

| Modo | Qué es |
|---|---|
| **Clásico** | Sin fin. Se juega hasta que no cabe ninguna pieza. |
| **Niveles (1–30)** | Cada nivel tiene un objetivo (puntos, líneas o romper gemas) y jugadas contadas. Se gana con 1 a 3 estrellas según las jugadas que sobren. |
| **Reto diario** | Mismas piezas para todos los jugadores ese día (semilla por fecha). 30 jugadas para hacer el máximo puntaje. No necesita servidor. |
| **Piedra** (extremo) | Cada 4 jugadas cae una piedra que necesita dos limpiezas para romperse. Se desbloquea al superar el nivel 10. |
| **Bomba** (extremo) | Cada 7 jugadas aparece una bomba con contador de 6 jugadas; si llega a cero, pierdes. Se desbloquea al superar el nivel 20. |
| **Contrarreloj** (extremo) | 10 segundos por jugada y piezas grandes. Se desbloquea al superar el nivel 30. |

Puntuación: 1 punto por casilla, 10 / 40 / 90 por limpiar 1 / 2 / 3 líneas, bonus por combo, +15 por gema, +20 por bomba desactivada y +100 por dejar el tablero vacío.

## Arquitectura

```
src/
├─ core/          Reglas puras, sin DOM: motor, piezas, RNG con semilla, bot de calibración
├─ modes/         Cómo arranca cada modo (clásico, nivel, diario, extremos)
├─ levels/        levels.json, generado y calibrado por script
├─ services/
│  ├─ ads/        Interfaz común + AdMob (apps), portal web, anuncios de prueba
│  ├─ player.ts   Identificador anónimo de jugador
│  ├─ progress.ts Estrellas, récords, partida guardada, ajustes
│  └─ feedback.ts Sonido y vibración
├─ ui/            Pantallas: inicio, niveles, juego, ajustes
└─ main.ts        Arranque y navegación (incluye botón atrás de Android)
android/  ios/    Proyectos nativos generados por Capacitor
tests/            Pruebas del motor y de los 30 niveles
scripts/          Generador de niveles
```

- **Capacitor** empaqueta la misma web como app nativa. El build produce un solo `dist/index.html` que sirve para las apps, para portales HTML5 y para la web.
- **El motor es puro**: cada jugada devuelve un estado nuevo. El generador aleatorio guarda su estado dentro de la partida, así que una partida se puede guardar, retomar y reproducir igual.
- **Anuncios intercambiables**: el juego solo llama a `ads.rewarded()` y `ads.afterGame()`. Debajo se elige AdMob en Android/iOS, el SDK del portal en la web, o la pantalla de prueba.
- **Identidad del jugador (fase 1)**: un ID anónimo creado en el dispositivo más un apodo editable. No se recogen datos personales. En una fase 2 se puede vincular a Google Play Games / Game Center para rankings y progreso entre dispositivos.
- **Partida guardada**: si el sistema cierra la app, al volver aparece "Continuar partida".

## Niveles calibrados por un bot

`scripts/generate-levels.ts` construye cada nivel a partir de una semilla y lo calibra contra un bot voraz: el objetivo se fija por debajo de lo que alcanza el bot y las jugadas se ajustan a lo que necesitó, con margen que se reduce en los niveles altos. Las pruebas reproducen los 30 niveles y fallan si alguno no se puede ganar.

```bash
npm run levels   # regenera src/levels/levels.json
npm test         # motor + los 30 niveles
```

## Desarrollo

```bash
npm install
npm run dev      # juego en el navegador con recarga
npm test
npm run build    # dist/index.html (un solo archivo)
```

## Android

Requisitos: Android Studio (incluye el SDK y Java).

```bash
npm run android  # compila la web, sincroniza y abre Android Studio
```

En Android Studio: **Run** para probar en un teléfono o emulador. Para publicar: **Build → Generate Signed App Bundle** (`.aab`) y súbelo a Google Play Console (cuenta de desarrollador con pago único).

## iOS

Requisitos: un Mac con Xcode y una cuenta del Apple Developer Program (pago anual). Sin Mac se puede usar un servicio de compilación en la nube para Capacitor.

```bash
npm run ios      # compila la web, sincroniza y abre Xcode
```

## Anuncios: antes de publicar

Todo viene configurado con los **ID de prueba públicos de Google**, que nunca pagan. Para ganar dinero:

1. Crea la app en tu cuenta de AdMob (una para Android y otra para iOS) y dos bloques de anuncios: **Intersticial** y **Bonificado**.
2. Pega los ID de los bloques en `src/services/ads/config.ts` y cambia `useTestAds` a `false`.
3. Reemplaza el App ID de prueba en `android/app/src/main/AndroidManifest.xml` y en `ios/App/App/Info.plist`.
4. Configura el formulario de consentimiento (UMP) en AdMob; la app ya lo muestra cuando hace falta.

Frecuencia: un intersticial como máximo cada 3 partidas y nunca antes de 90 segundos desde el anterior (`AD_POLICY` en el mismo archivo). El anuncio bonificado solo aparece si el jugador elige continuar.

Para portales web: el adaptador `src/services/ads/portal-ads.ts` sigue la forma del SDK de CrazyGames. Revisa la documentación vigente del portal antes de publicar.

## Pendiente antes de la primera publicación

- Cambiar `appId` en `capacitor.config.ts` por tu dominio invertido (no se puede cambiar después de publicar).
- Icono y pantalla de carga propios (`npx @capacitor/assets generate` a partir de un icono de 1024×1024).
- Política de privacidad publicada en una URL (la piden ambas tiendas).
- Probar los niveles con jugadores reales y ajustar la dificultad.
