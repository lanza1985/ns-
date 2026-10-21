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
├── uml-class.css              Lienzo, clases y relaciones UML
├── core.js                    Estado compartido, utilidades y versión
├── exam-context.js            Parámetros de URL y metadata de sesión/examen
├── editor.js                  Modelo, renderizado y controles del editor
├── nsplus-format.js           Importación y exportación de archivos .nsplus
├── runtime.js                 Compilación, intérprete y panel de ejecución
├── drag-drop.js               Arrastrar, soltar, reubicar y eliminar bloques
├── persistence.js             Autoguardado local y arranque de la aplicación
├── uml-class.js               Editor de clases y relaciones UML
└── browser-tests.js           Pruebas ejecutables desde el navegador
```

El orden de los `<script defer>` en `index.html` es parte de la arquitectura:
los archivos posteriores usan las funciones y el estado declarados por los
anteriores. Si se agrega un archivo, incluilo allí en el punto apropiado.

## Pruebas en el navegador

Abrí `index.html` y hacé clic en **Ejecutar pruebas** en el pie de página.
El cuadro muestra cada resultado y el total de pruebas correctas. Podés volver
a ejecutarlas con **Ejecutar de nuevo**. No requieren instalación ni framework
y usan datos propios para no cambiar el proyecto abierto. Cubren el formato
`.nsplus`, la ejecución de diagramas, el autoguardado, la conversión UML y los
controles de bloques.

## Versión

La versión actual es **v1.1.27** y se muestra en el pie de la aplicación. En
cada cambio, incrementá `APP_VERSION` en `core.js` y actualizá este número antes
de publicar. Así las personas usuarias siempre pueden identificar la versión
que están ejecutando.

## Cómo funciona

- Un proyecto puede contener muchos diagramas. El panel **Diagramas** permite
  crear y cambiar entre ellos. Los métodos se agrupan bajo su clase; al agregar
  un método desde Declaraciones se incorpora a la clase actual. Cada uno
  conserva sus propias instrucciones, declaraciones y firma de método. El área
  central muestra juntos los métodos de la clase seleccionada. Se puede elegir
  una clase desde su encabezado en el panel, y la flecha de cada método permite
  contraerlo o expandirlo. Este estado se conserva al guardar. Cada método
  tiene **+ Variable** junto a su firma para agregarle parámetros, variables
  locales, variables inicializadas o constantes. En un constructor, el menú
  ofrece sólo parámetros. El **+ Variable** del encabezado de la clase agrega
  un atributo de clase.
- La pestaña **UML Clases** permite crear clases, escribir atributos y métodos,
  moverlas en el lienzo y conectarlas con asociaciones, herencia,
  implementación, agregación, composición o dependencia. La selección se edita
  en el panel derecho; **Exportar SVG** descarga una imagen del diagrama.
  Las clases y relaciones se conservan en el autoguardado y en los archivos
  `.nsplus` creados por NS#.
- **+ Enum** agrega una enumeración UML con el estereotipo `«enum»`.
  Escribí un valor por línea en **Valores del enum**. Los enums se pueden mover,
  conectar y exportar a SVG, y se conservan al guardar el proyecto. Al exportar
  a NS#, sólo las clases generan métodos; los enums permanecen en el diagrama
  UML y sus valores no se convierten en código ejecutable. Un atributo de clase
  cuyo tipo coincide con un enum crea una relación automática hacia ese enum.
- En **UML Clases**, escribí un miembro por línea. Un atributo puede ser
  `+ cliente: Cliente` o `- edad: Integer = 18`. Un método puede ser
  `+ guardar(cliente: Cliente): Boolean`; también se aceptan parámetros con el
  tipo primero, como `Cliente cliente`. Los símbolos `+`, `-`, `#` y `~`
  representan visibilidad pública, privada, protegida y de paquete. Se puede
  agregar `static` al método o al atributo. Por ejemplo,
  `+ static personas: List<Persona> = new ArrayList<Persona>()` crea una variable
  estática al exportar a NS#. `+ Persona(numero: Integer)` define un constructor
  de `Persona`. **Conectar clases** pide seleccionar el origen y
  después el destino; seleccioná una relación para cambiar su tipo o etiqueta.
  Las asociaciones muestran una flecha abierta hacia el destino. Si el origen
  tiene un atributo del tipo de la clase destino, aparece su nombre
  sobre la flecha y se oculta en la caja de la clase. Si hay varios atributos
  hacia la misma clase, se dibuja una conexión separada para cada uno.
  Seleccioná la flecha para cambiar el tipo de relación o editar el nombre del
  atributo; el tipo del atributo se muestra sin edición. Una etiqueta escrita
  en la relación reemplaza el texto de la flecha. En asociaciones podés elegir
  multiplicidad `1`, `0..1`, `0..N` o `1..N`; se muestra junto a la clase de
  destino y se conserva al guardar el proyecto.
  La tecla Supr elimina la clase o relación seleccionada cuando no se está
  escribiendo en un campo.
- Al escribir un atributo como `+ cliente: Cliente`, si existe una clase única
  llamada `Cliente`, aparece una asociación azul automáticamente. También se
  reconocen tipos como `Cliente[]` y `List<Cliente>`. La conexión muestra el
  nombre del atributo y sigue sus cambios; una relación
  dibujada manualmente entre las mismas clases tiene prioridad. La línea
  automática sale de la sección de atributos y llega al encabezado de la clase
  correspondiente.
- Para subrayar sólo el nombre de un atributo en UML y en el SVG, escribilo
  entre guiones bajos, por ejemplo `+ _edad_: Integer`. Al exportar a NS#,
  el nombre del atributo será `edad`.
- **Exportar a NS#** crea un diagrama por método UML, con parámetros en la
  firma y atributos en una sección única de variables de clase. Los atributos
  con valor inicial se convierten en variables inicializadas. Si una clase no
  tiene métodos, se crea un método `main` vacío. Si un atributo o método no
  tiene una sintaxis reconocible, la exportación indica el primer dato que hay
  que corregir y no cambia NS#. Antes de exportar se muestra
  una confirmación: al aceptarla, se elimina todo el contenido actual de NS# y
  se generan los diagramas desde UML. Cancelar conserva los diagramas actuales.
  Los métodos sobre una misma instancia comparten sus atributos; los marcados
  `static` pertenecen a la clase y se comparten entre instancias. Un parámetro
  o variable local con el mismo nombre tiene prioridad dentro de su método.
  Las exportaciones de versiones anteriores se
  migran al abrirlas para quitar las copias repetidas de cada método.
- Para usar un diagrama desde otro, definí su clase, método y parámetros en la
  cabecera. Después agregá un bloque **Funciones / Métodos** y escribí, por
  ejemplo, `resultado = Calculadora.sumar(2, 3)` si existe ese diagrama. Incluí
  un bloque `return` en el método si necesitás usar su resultado.
- Durante la ejecución, los diagramas con el mismo nombre de clase forman una
  clase ejecutable. Las variables sin `static` pertenecen a cada objeto; las
  variables `static` pertenecen a la clase. Las llamadas `Clase.metodo(...)`
  a métodos no estáticos usan una instancia compartida durante esa ejecución.
  También podés crear instancias con `vehiculo = new Vehiculo()`,
  asignar propiedades con `vehiculo.color = "Red"` y llamar a sus métodos desde
  un bloque **Funciones / Métodos** o de instrucción, por ejemplo
  `vehiculo.setColor("Blue")`.
- Las variables de clase pueden guardar objetos, por ejemplo una variable
  inicializada de tipo `ArrayList<String>` con valor `new ArrayList<>()`.
  En **Funciones / Métodos** o en una instrucción se pueden llamar
  `lista.add(valor)`, `lista.add(i, valor)`, `lista.get(i)`,
  `lista.set(i, valor)`, `lista.remove(i)`, `lista.size()`, `lista.isEmpty()`,
  `lista.contains(valor)`, `lista.indexOf(valor)` y `lista.clear()`.
  **PARA CADA** recorre la lista.
  Los índices comienzan en 0. `remove` con un número elimina por índice;
  con otro tipo de valor elimina la primera coincidencia.
- **+ Constructor** crea un diagrama con el mismo nombre que la clase. Agregá
  parámetros con su **+ Variable** y usá bloques de instrucción para inicializar
  atributos, por ejemplo `this.edad = edad`; se ejecuta al evaluar
  `new Persona(18)`. Los constructores admiten instrucciones, condiciones y
  bucles; no solicitan entrada interactiva ni llaman métodos asíncronos.
  Marcá **static** junto a una variable de clase para acceder a ella como
  `Persona.personas`, incluso desde otras clases. **static** es independiente
  de **Constante**; para una lista modificable, elegí **Inicializada** y usá
  `new ArrayList<Persona>()`. Una llamada como
  `Persona.personas.add(new Persona(18));` funciona en un bloque de instrucción.
- `blocks` contiene las instrucciones del diagrama activo.
- Los bloques `if`, `switch` y los bucles pueden contener otros bloques.
- `declarations` guarda parámetros, constantes y variables del método.
- `classDeclarations` guarda los atributos de cada clase y cuáles son `static`.
  La sección **Variables de clase** permite agregarlos, editarlos y quitarlos
  desde NS#. Las declaraciones que ya estaban en métodos exportados desde UML
  se migran a esta sección al abrir proyectos anteriores.
- `method` guarda clase, modificadores, tipo de retorno y nombre del método.
- `umlState` guarda las clases y relaciones creadas a mano. Las asociaciones
  deducidas de los tipos se recalculan y no se guardan por separado.
- `editorMode` recuerda si estaba abierta la vista NS# o UML. El guardado local
  y el archivo `.nsplus` de NS# conservan estos datos y el método activo.
- `render()` vuelve a dibujar la interfaz cuando cambia algún dato.
- `compile()` convierte el árbol visual en pasos simples para el ejecutor.
- `advance()` ejecuta un paso y controla entradas, salidas, saltos y bucles.
- El guardado `.nsplus` conserva el contenedor de NS Plus 0.5. Incluye una
  representación HTML de los diagramas y el estado completo de NS# en
  `editorState`. Al abrir un archivo de otro editor que no tenga ese estado,
  NS# reconstruye los diagramas desde el HTML disponible.
- Cada modificación crea una copia automática en `localStorage`.
- El botón **Reportar un bug** abre el cliente de correo predeterminado con el
  destinatario y asunto ya completados. Para usarlo, el navegador debe tener
  configurado un cliente o servicio de correo para enlaces `mailto:`.

## Programar y ejecutar

| Bloque | Comportamiento |
| --- | --- |
| **E** y **S** | Pide un valor y lo guarda en una variable; muestra el resultado de una expresión. La entrada reconoce números, `true`, `false` y JSON; en los demás casos conserva texto. |
| **Instrucción** | Acepta una asignación (`total = total + 1`, `this.edad = edad`) o una llamada (`lista.add(valor)`, `Persona.personas.add(new Persona(2))`). El `;` final es opcional. |
| **Variable inicializada**, **Variable**, **Constante** y **Parámetro** | Declaran valores locales o parámetros del método. **Variables de clase** agrega atributos de instancia o `static`. |
| **SI** y **SEGÚN** | Elige una rama por condición o por valor, con opción `default` en **SEGÚN**. |
| **MIENTRAS**, **REPETIR**, **PARA** y **PARA CADA** | Ejecutan bucles; **PARA** incluye el límite final y **PARA CADA** recorre colecciones iterables, como `ArrayList`. |
| **Funciones / Métodos** y **return** | Llaman a métodos de diagramas, objetos o funciones disponibles, y devuelven un valor al llamador. |
| **Comentario** | Se muestra en el diagrama y no se ejecuta. |

Las expresiones se evalúan con JavaScript y NS# adapta las formas documentadas
de `new ArrayList<>()` y `new ArrayList<T>()`. Los tipos escritos en las
declaraciones, incluidos los genéricos como `List<Persona>`, describen los datos
pero el ejecutor no comprueba tipos como un compilador Java. Los constructores
de diagramas se ejecutan al crear un objeto con `new`; pueden usar
instrucciones, salidas, selecciones y bucles, pero no una entrada **E**,
llamadas asíncronas ni un bloque `return`. **Constante** conserva su valor
inicial en el proyecto, pero actualmente el ejecutor permite reasignarla.
La visibilidad `public`, `private` y `protected` se muestra en la firma, sin
restricciones de acceso durante la ejecución.

Los botones **Ejecutar**, **Paso**, **Ⅱ** (pausa) y **↺** (reiniciar) controlan la
ejecución. El panel muestra la salida, las variables y los errores; el control
de velocidad ajusta la ejecución automática.

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
