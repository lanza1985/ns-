# NS#

Editor de diagramas Nassi–Shneiderman hecho con HTML, CSS y JavaScript clásico.
No necesita dependencias, compilación ni un servidor.

Creado por **Luis Lanzafame** y distribuido como software libre bajo la
[licencia MIT](LICENSE). Podés usarlo, estudiarlo, modificarlo y compartirlo.

## Cómo abrirlo

Abrí `index.html` desde la raíz del proyecto con doble clic. Funciona mediante
`file://`: no necesita dependencias, instalación, compilación ni un servidor.
Mantené todos los archivos JavaScript junto a `index.html`, porque este los
carga directamente. También se puede publicar el contenido de esta carpeta en
cualquier hosting estático.

La aplicación usa scripts clásicos con `defer`, no módulos ES (`import` /
`export`). Esto permite abrirla localmente sin los bloqueos CORS que algunos
navegadores aplican a los módulos cargados desde `file://`.

## Estructura

```text
├── index.html                 Interfaz y orden de carga de los scripts
├── styles.css                 Diseño, colores y tema oscuro
├── core.js                    Estado compartido, utilidades y versión
├── editor.js                  Modelo, renderizado y controles del editor
├── nsplus-format.js           Importación y exportación de archivos .nsplus
├── runtime.js                 Compilación, intérprete y panel de ejecución
├── drag-drop.js               Arrastrar, soltar, reubicar y eliminar bloques
└── persistence.js             Autoguardado local y arranque de la aplicación
```

El orden de los `<script defer>` en `index.html` es parte de la arquitectura:
los archivos posteriores usan las funciones y el estado declarados por los
anteriores. Si se agrega un archivo, incluilo allí en el punto apropiado.

## Versión

La versión actual es **v1.1.7** y se muestra en el pie de la aplicación. En
cada cambio, incrementá `APP_VERSION` en `core.js` y actualizá este número antes
de publicar. Así las personas usuarias siempre pueden identificar la versión
que están ejecutando.

## Cómo funciona

- Un proyecto puede contener muchos diagramas. El panel **Diagramas** permite
  crear y cambiar entre ellos. Los métodos se agrupan bajo su clase; al agregar
  un método desde Declaraciones se incorpora a la clase actual. Cada uno
  conserva sus propias instrucciones, declaraciones y firma de método.
- Para usar un diagrama desde otro, definí su clase, método y parámetros en la
  cabecera. Después agregá un bloque **Funciones / Métodos** y escribí, por
  ejemplo, `resultado = Math.sum(2, 3)`. La función debe terminar con un bloque
  `return` si necesitás usar su resultado.
- `blocks` contiene las instrucciones del diagrama activo.
- Los bloques `if`, `switch` y los bucles pueden contener otros bloques.
- `declarations` guarda parámetros, constantes y variables del método.
- `method` guarda clase, modificadores, tipo de retorno y nombre del método.
- `render()` vuelve a dibujar la interfaz cuando cambia algún dato.
- `compile()` convierte el árbol visual en pasos simples para el ejecutor.
- `advance()` ejecuta un paso y controla entradas, salidas, saltos y bucles.
- El guardado `.nsplus` conserva el formato de NS Plus original.
- Cada modificación crea una copia automática en `localStorage`.
- El botón **Reportar un bug** abre el cliente de correo predeterminado con el
  destinatario y asunto ya completados. Para usarlo, el navegador debe tener
  configurado un cliente o servicio de correo para enlaces `mailto:`.

## Guardado local

El botón **Guardado local** permite:

- guardar inmediatamente;
- restaurar la última copia automática;
- eliminar la copia almacenada.

Al volver a abrir la aplicación, la última sesión se recupera automáticamente.
Este guardado pertenece al navegador y no reemplaza los archivos `.nsplus`.

## Regla de entrada y salida

El bloque `S` muestra un mensaje. El bloque `E` solicita un valor y lo guarda en
la variable indicada. Para pedir una edad, por ejemplo:

1. `S "Ingresá tu edad"`
2. `E edad`

## Agregar un bloque nuevo

1. Agregá su botón en `index.html` con `data-add="nombre"`.
2. Definí sus valores iniciales en `fresh()` dentro de `editor.js`.
3. Dibujalo en `blockHTML()` dentro de `editor.js`.
4. Agregá su comportamiento en `compile()` y `advance()` dentro de `runtime.js`.
5. Si debe viajar a NS Plus original, agregá su conversión en
   `blockToNsPlus()` y `parseBlock()` dentro de `nsplus-format.js`.

Los comentarios del código explican cada parte importante y los nombres de las
funciones describen su responsabilidad.

## Autor y licencia

- Autor: **Luis Lanzafame**
- Licencia: **MIT**
- Año: **2026**
