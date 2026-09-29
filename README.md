# Blackjack · Entrenamiento

Simulador de Blackjack pensado para **una sola cosa**: medir qué porcentaje de tus
jugadas coincide con la estrategia básica, y ver cómo ese porcentaje sube mano a mano
hasta acercarse al 100%.

No es un juego de casino. Es un entrenador con mesa de casino.

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
npm run dev
```

- Cliente: <http://localhost:5173>
- API: <http://localhost:4000>

El único requisito es **Node 20 o superior**. La base de datos SQLite se crea sola en
`server/data/blackjack.sqlite` la primera vez que arrancas.

Otros comandos:

```bash
npm test         # 76 tests: motor, tabla de estrategia, flujo de ronda y render
npm run build    # compila cliente y servidor
npm start        # sirve el build ya compilado desde el propio servidor
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
Velocidad de reparto (lenta / normal / rápida / instantánea), número de barajas (1 a 8),
penetración del mazo, cartera inicial, apuesta base, y las reglas de la casa: H17/S17,
doble tras dividir, rendición tardía, pago del blackjack (3:2 o 6:5) y máximo de manos
por división. **Cambiar las reglas recalcula la tabla óptima al instante.**

También hay un contador **Hi-Lo** opcional (corriente y real) para entrenamiento avanzado.

### Atajos de teclado

| Tecla | Acción |
|---|---|
| `P` | Pedir |
| `S` | Plantarse |
| `D` | Doblar |
| `V` | Dividir |
| `R` | Rendirse |
| `Espacio` | Repartir / Siguiente mano |

---

## La tabla de estrategia

Vive en [`client/src/strategy/tables.ts`](client/src/strategy/tables.ts), escrita como
matrices legibles para poder auditarla de un vistazo. Es la estrategia básica
multi-baraja (4-8 mazos) compuesta por total, con las desviaciones de H17 aplicadas
encima de la tabla S17.

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

52 tests cubren esta tabla casilla por casilla, incluidos los casos frontera (A,7 contra
2 según H17; 8,8 contra A; 9,9 contra 7-10-A; las parejas que dependen del DAS).

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
    styles/      Design tokens y CSS por área
server/
  src/
    db/          SQLite (better-sqlite3) + esquema
    routes/      sessions, rounds, stats
```

El motor (`engine/`) y la estrategia (`strategy/`) son **funciones puras sin dependencias
de React**, por eso se pueden testear directamente y son el grueso de la suite.

Si el backend no está levantado, la mesa sigue siendo jugable: solo se pierde la
persistencia, y la interfaz lo avisa con un indicador *Sin servidor*.

### Base de datos

SQLite, elegido sobre Postgres porque esto es una herramienta personal y de un solo
usuario: cero configuración, un único fichero, y consultas analíticas suficientes
(incluidas funciones de ventana para los bloques de la curva de aprendizaje).

Tres tablas, en [`server/src/db/schema.sql`](server/src/db/schema.sql):

- **`sessions`** — cada tanda de entrenamiento con su configuración.
- **`rounds`** — cada mano jugada: apuesta, resultado neto, saldo, carta del crupier.
- **`decisions`** — la unidad de medida: situación, jugada elegida, jugada óptima, acierto y tiempo de reacción.

Para mover la base de datos a otro sitio: `BJ_DB_PATH=/ruta/al/fichero.sqlite`.

### Endpoints

| Método | Ruta | Para qué |
|---|---|---|
| `POST` | `/api/sessions` | Abre una sesión de entrenamiento |
| `GET` | `/api/sessions` | Últimas 50 sesiones con su resumen |
| `POST` | `/api/rounds` | Guarda una ronda y sus decisiones (transaccional) |
| `POST` | `/api/rounds/decisions` | Guarda decisiones sueltas del modo drill |
| `GET` | `/api/stats/summary` | Cifras globales |
| `GET` | `/api/stats/progress?bucket=25` | Curva de aprendizaje |
| `GET` | `/api/stats/bankroll` | Saldo mano a mano |
| `GET` | `/api/stats/situations` | Precisión por casilla |
| `GET` | `/api/stats/mistakes?limit=10` | Errores más repetidos |
| `DELETE` | `/api/stats` | Borra todo el historial |

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
