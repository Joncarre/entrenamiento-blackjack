# Blackjack · Entrenamiento

Simulador de Blackjack pensado para **una sola cosa**: medir qué porcentaje de tus
jugadas coincide con la estrategia básica, y ver cómo ese porcentaje sube mano a mano
hasta acercarse al 100%.

No es un juego de casino. Es un entrenador con mesa de casino.

---

## Las reglas de la mesa

La aplicación viene configurada con el reglamento del **casino de Madrid** donde vas a
jugar, porque las reglas de la casa cambian la tabla óptima:

| Regla | En esta mesa |
|---|---|
| Barajas | **6** (fijo) |
| La banca | Se planta con **17 o más**, pide con 16 o menos (S17) |
| Doblar | **Solo con 9, 10 u 11 puntos**, y recibes una sola carta |
| Doblar tras dividir | Sí |
| Dividir | **A dos manos**: una sola división |
| Ases divididos | Un solo naipe por mano; un 10 después **no es blackjack** |
| Blackjack | Paga **3:2** (una vez y media) |
| Seguro | Disponible con As del crupier, paga **2:1** |
| Rendición | **No existe** (el reglamento no la contempla) |

Dos de estas reglas mueven bastantes casillas respecto a la tabla genérica que se
encuentra por internet:

- **Doblar solo con 9/10/11 elimina todos los dobles de manos blandas.** A,2 a A,6
  simplemente piden, y A,7 contra 3-6 **se planta** en vez de doblar.
- **Sin rendición**, 15 y 16 contra 9, 10 o As **se piden**. No hay escapatoria.

Puedes cambiar cualquier regla en **Ajustes** si vas a otra mesa: la tabla, el corrector
y las estadísticas se recalculan solos. Si te apartas del perfil del casino, la propia
pantalla te avisa.

---

## La idea

En Blackjack el número de situaciones distintas es pequeño y, para cada una, existe una
jugada matemáticamente óptima. Esa tabla es finita y aprendible. La aplicación:

1. Reparte manos reales contra un crupier que sigue las reglas de la casa.
2. En cada decisión compara lo que has hecho con lo que dice la tabla.
3. Guarda cada decisión en una base de datos local.
4. Te enseña la curva: **tasa de jugadas teóricas** por bloques, y en qué casillas concretas fallas.

Cuando esa tasa se estabiliza cerca del 100%, juegas de forma óptima.

---

## Arranque rápido

```bash
npm install
cp client/.env.example client/.env   # y rellena las claves de Firebase
npm run dev
```

Abre <http://localhost:5173>. El único requisito es **Node 20 o superior**.

Sin las claves de Firebase la mesa funciona igual: solo deja de guardarse el historial, y
la interfaz lo avisa. Para obtenerlas, crea un proyecto en
[console.firebase.google.com](https://console.firebase.google.com), activa **Firestore
Database** y copia la configuración de *Configuración del proyecto → Tus apps → Web*.

Otros comandos:

```bash
npm test         # 111 tests: motor, tabla, reglas del casino, flujo y render
npm run build    # build de producción en client/dist
npm run preview  # sirve ese build en local
npm run typecheck
```

---

## Qué incluye

### Mesa
Reparto animado carta a carta, volteo 3D de la carta tapada, divisiones, doblar,
rendición y seguro. El crupier respeta las reglas configuradas.

### Corrector de jugada
Tras cada decisión te dice si coincide con la tabla y, si no, **cuál era la correcta y
por qué**. Tres niveles:

| Nivel | Qué hace |
|---|---|
| **Aprendizaje** | Marca la jugada correcta *antes* de que decidas. |
| **Corrección** | Te corrige justo *después* de decidir. Es el modo por defecto. |
| **Examen** | Ni pistas ni correcciones. Mide tu nivel real. |

Además, el **modo estricto** no deja ejecutar una jugada que se aparta de la tabla: la
registra como fallo, te la corrige y te deja repetirla. Acelera mucho la memorización.

### Entrenamiento rápido (drill)
Solo la decisión, sin repartir la mano entera. Ves cinco veces más situaciones por
minuto que jugando. Puedes filtrar por totales duros, blandos, parejas o —lo más
útil— **por las casillas que estás fallando**.

### Tabla de estrategia consultable
La tabla completa dentro de la app, recalculada según las reglas que tengas puestas
(S17/H17, DAS, rendición). Con el interruptor *Mis aciertos* se superpone tu dominio
real de cada casilla.

### Progreso
- Tasa de jugadas teóricas global y de las **últimas 100 decisiones** (tu nivel actual, no el histórico).
- **Curva de aprendizaje**: precisión por bloques de decisiones consecutivas.
- **Evolución de la cartera** mano a mano.
- **Puntos débiles**: casillas con fallos repetidos, ordenadas por urgencia.
- **Errores más repetidos**: qué jugaste frente a qué tocaba.
- Ventaja real obtenida por euro apostado y tiempo medio de decisión.

### Configuración
Velocidad de reparto (lenta / normal / rápida / instantánea), penetración del mazo,
cartera inicial, apuesta base, y todas las reglas de la casa: H17/S17, doble restringido
a 9/10/11, doble tras dividir, rendición, pago del blackjack (3:2 o 6:5) y máximo de
manos por división. **Cambiar las reglas recalcula la tabla óptima al instante.**

Las barajas están fijadas en 6, como la mesa de referencia.

También hay un contador **Hi-Lo** opcional (corriente y real) para entrenamiento avanzado.

### Atajos de teclado

La tecla es la inicial de la jugada, y la misma letra que su símbolo en la tabla.

| Tecla | Acción |
|---|---|
| `P` | Pedir |
| `Q` | Quedarse |
| `D` | Doblar |
| `S` | Separar |
| `R` | Retirarse |
| `Espacio` | Repartir / Siguiente mano |

Las jugadas se llaman igual y se pintan del mismo color en la mesa, en el drill y en la
tabla: los colores salen de un único juego de tokens (`--act-*`), de modo que la mesa no
puede acabar enseñando una asociación y la tabla la contraria.

---

## La tabla de estrategia

Vive en [`client/src/strategy/tables.ts`](client/src/strategy/tables.ts), escrita como
matrices legibles para poder auditarla de un vistazo. Es la estrategia básica
multi-baraja compuesta por total.

`resolvedTables(rules)` devuelve **la tabla que realmente aplica en tu mesa**, no la
genérica: aplica las desviaciones de H17 y además colapsa las casillas que las reglas de
la casa hacen imposibles (los dobles que la mesa no permite pasan a pedir o plantarse,
las rendiciones caen a su alternativa). Por eso lo que ves en la pestaña *Tabla* es
exactamente lo que tienes que memorizar, sin notas al pie que traducir sobre la marcha.

Referencia: Wizard of Odds / Blackjack Apprenticeship.

Códigos de celda:

| Código | Significado |
|---|---|
| `H` | Pedir |
| `S` | Plantarse |
| `Dh` | Doblar; si no se puede, pedir |
| `Ds` | Doblar; si no se puede, plantarse |
| `P` | Dividir |
| `Ph` | Dividir solo si la mesa permite doblar tras dividir |
| `Rh` / `Rs` / `Rp` | Rendirse; si no se puede, pedir / plantarse / dividir |
| `N` | No dividir: se juega como total duro o blando |

El orden de evaluación importa y es: **rendición → división → doblar → pedir/plantarse**.

En pantalla las casillas se etiquetan en castellano con el patrón **mayúscula =
jugada que quieres hacer, minúscula = a lo que recurres si no puedes**: `Rp` es
«retirarse; si no se puede, pedir», `Dq` es «doblar; si no se puede, quedarse». Así la
casilla se lee sola, sin notas al pie.

| En pantalla | Jugada |
|---|---|
| `P` | Pedir |
| `Q` | Quedarse (plantarse) |
| `S` | Separar la pareja (dividir) |
| `Dp` / `Dq` | Doblar; si no, pedir / quedarse |
| `SDp` | Separar para poder Doblar después; si no, pedir |
| `Rp` / `Rq` / `Rs` | Retirarse; si no, pedir / quedarse / separar |

No confundir con los códigos internos de la tabla, que están en inglés y se cruzan con
estos: la celda `S` del fuente (*stand*) se pinta `Q`, y la celda `P` (*split*) se
pinta `S`.

70 tests cubren esta tabla casilla por casilla: los casos frontera de la tabla de
referencia (A,7 contra 2 según H17; 8,8 contra A; 9,9 contra 7-10-A; las parejas que
dependen del DAS) y un bloque específico que fija el comportamiento con las reglas del
casino.

---

## Arquitectura

```
client/
  src/
    engine/      Motor puro: cartas, evaluación de manos, reglas, liquidación
    strategy/    Tabla de estrategia y resolutor de la jugada óptima
    store/       Estado del juego (Zustand) y ajustes persistidos
    components/  Carta, mano, HUD, controles, gráfica de líneas
    views/       Mesa, Drill, Tabla, Progreso, Ajustes
    lib/         Conexión con Firestore y capa de historial
    styles/      Design tokens y CSS por área
firestore.rules  Reglas de seguridad de la base
netlify.toml     Build y cabeceras del despliegue
```

**No hay backend.** El cliente habla directamente con Firestore, así que el despliegue es
un sitio estático. El motor (`engine/`) y la estrategia (`strategy/`) son funciones puras
sin dependencias de React, por eso se pueden testear directamente y son el grueso de la
suite.

Si falta la configuración de Firebase o la red falla, la mesa sigue siendo jugable: solo
se pierde la persistencia, y la interfaz lo avisa con un indicador *Sin historial*.

> El servidor Express con SQLite que tenía el proyecto quedó retirado al migrar a
> Firestore. Sigue en el historial de git por si alguna vez interesa volver a un montaje
> local.

### Base de datos

Firestore. Dos decisiones gobiernan el diseño, en [`client/src/lib/api.ts`](client/src/lib/api.ts):

**Los totales van preagregados.** Firestore cobra por documento leído y no sabe agrupar,
así que recalcular las estadísticas desde el detalle costaría una lectura por cada
decisión jugada. En su lugar, cada escritura incrementa contadores y las consultas leen
unos pocos documentos, independientemente del historial acumulado.

**Nada se borra nunca.** «Borrar historial» avanza un contador de época y todo lo anterior
deja de consultarse. Eso permite que las reglas prohíban el borrado por completo, que sin
autenticación es la operación más peligrosa.

```
stats/global                  Contadores de siempre + época viva
sessions/{id}                 Configuración de cada tanda
epochs/{e}/rounds/{id}        Cada mano: apuesta, resultado, saldo
epochs/{e}/decisions/{id}     La unidad de medida del entrenamiento
epochs/{e}/progress/{bloque}  Aciertos por bloque de 10 decisiones
epochs/{e}/situations/{clave} Aciertos por casilla de la tabla
epochs/{e}/mistakes/{clave}   Errores más repetidos
```

### Seguridad

La app no usa autenticación, así que [`firestore.rules`](firestore.rules) es lo único que
protege los datos: las claves de Firebase viajan en el bundle y cualquiera puede leerlas.
Las reglas **prohíben todo borrado** y validan tipos, rangos y tamaños de cuanto se
escribe, de modo que el peor caso de un abuso sea basura añadida y nunca la pérdida del
progreso.

Si algún día se añade login, basta sustituir los `true` de las reglas por
`request.auth.uid == <propietario>`.

---

## Despliegue

El sitio es estático: Netlify publica `client/dist` y el cliente habla con Firestore.

1. **Firebase** — crea el proyecto, activa Firestore en modo producción y pega el
   contenido de `firestore.rules` en *Firestore → Reglas*.
2. **Netlify** — conecta el repositorio. [`netlify.toml`](netlify.toml) ya trae el comando
   de build, la carpeta a publicar y las cabeceras.
3. **Variables de entorno** — en *Site settings → Environment variables*, las seis
   `VITE_FIREBASE_*` de [`client/.env.example`](client/.env.example). Son necesarias en el
   build, no en ejecución: si las cambias, hay que volver a desplegar.

---

## Notas de diseño

**Dark mode único y deliberado.** No hay modo claro: la mesa de fieltro y las cartas
sobre fondo oscuro son el punto de partida, no una variante.

**La cifra que manda.** La tasa de jugadas teóricas es lo más grande de la pantalla en
la mesa y en el dashboard, porque es el objetivo de toda la aplicación. El dinero es
secundario: a corto plazo depende de la suerte, la tasa no.

**Paleta de datos validada.** Las gráficas usan `#27a983` (teal), `#5a86d8` (azul) y
`#c9791f` (ámbar), verificados sobre la superficie oscura para banda de luminosidad,
croma, separación bajo daltonismo (ΔE ≥ 8 en deuteranopía y protanopía) y contraste.
El mapa de dominio de la tabla evita el par rojo/verde justamente por eso, y en todos
los casos el color acompaña a un número o una etiqueta: nunca es el único canal.

**Pensada para el móvil.** Es donde se entrena de verdad, así que: alturas táctiles de
44 px, `hover` sólo en dispositivos con puntero (en táctil se queda pegado al tocar),
`100dvh` para que la barra del navegador no mueva el layout, y respeto de las zonas
seguras del dispositivo. La tabla no cabe entera en una pantalla estrecha —necesita unos
426 px y un iPhone SE deja 323 útiles— así que la columna de la mano queda fija al
desplazar y los bordes se difuminan para indicar que hay más tabla a los lados.

**Animación con peso.** Las cartas entran desde la posición del zapato con una curva de
muelle, y la carta tapada usa un volteo 3D real. Todo respeta
`prefers-reduced-motion`.

---

## Qué falta / ideas

- Desviaciones del conteo (Illustrious 18) para el entrenamiento avanzado.
- Exportar el historial a CSV.
- Repetición espaciada real en el drill, ponderando por antigüedad del fallo.

---

## Aviso

Esto es una herramienta de entrenamiento. La estrategia básica reduce la ventaja de la
casa a un 0,5% aproximado, pero **no la elimina**: a largo plazo el juego sigue siendo
perdedor. Sirve para jugar lo mejor posible, no para ganar dinero.
