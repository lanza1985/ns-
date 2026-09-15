# NS#

Editor de diagramas Nassi–Shneiderman hecho con HTML, CSS y JavaScript clásico.
No necesita dependencias, compilación ni un servidor.

Creado por **Luis Lanzafame** y distribuido como software libre bajo la
[licencia MIT](LICENSE). Podés usarlo, estudiarlo, modificarlo y compartirlo.

## Cómo abrirlo

Entrá en la carpeta `dist` y abrí `index.html` con doble clic. También podés
publicar esa carpeta en cualquier hosting estático.

## Estructura

```text
├── index.html                 Interfaz y controles
├── styles.css                Diseño, colores y tema oscuro
└── app.js                    Editor, guardado, ejecución y drag & drop
```

## Versión

La versión actual es **v1.1.0** y se muestra en el pie de la aplicación. En
cada cambio, incrementá `APP_VERSION` en `app.js` y actualizá este número antes
de publicar. Así las personas usuarias siempre pueden identificar la versión
que están ejecutando.

## Cómo funciona

- Un proyecto puede contener muchos diagramas. El panel **Diagramas** permite
  crear y cambiar entre ellos; cada uno conserva sus propias instrucciones,
  declaraciones y firma de método.
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
2. Definí sus valores iniciales en `fresh()` dentro de `app.js`.
3. Dibujalo en `blockHTML()`.
4. Agregá su comportamiento en `compile()` y `advance()`.
5. Si debe viajar a NS Plus original, agregá su conversión en
   `blockToNsPlus()` y `parseBlock()`.

Los comentarios del código explican cada parte importante y los nombres de las
funciones describen su responsabilidad.

## Autor y licencia

- Autor: **Luis Lanzafame**
- Licencia: **MIT**
- Año: **2026**
