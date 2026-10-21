# Mi tienda: recepción de mercancía

Aplicación React + Vite y Supabase (PostgreSQL, Auth y Storage). Diseño en español, responsive y sin borradores ni captura con cámara.

## Ejecutar

Requiere Node.js 20.19+ o 22.12+.

```sh
npm install
npm run dev
```

`npm run build` genera `dist/`. `npm test` verifica cálculos, validaciones, reintentos, catálogo, proveedores y conservación del inventario en modo demo.

## Conectar Supabase

1. Crear un proyecto Supabase.
2. Ejecutar **una vez** `public/supabase/schema.sql` en el editor SQL. El script corre en una transacción. Usa nombres de tablas nuevos; si ya existen, revisarlos antes de ejecutar. No elimina datos existentes.
3. Crear un usuario en Authentication → Users, con correo confirmado y contraseña.
4. En la app abrir Configuración e ingresar Project URL y la clave pública publishable o anon. Iniciar sesión. Nunca usar service_role ni secret key.
5. Agregar proveedores, capturar una entrada y confirmar. Revisar inventario e historial.

Alternativa de configuración para desarrollo: copiar `.env.example` a `.env.local`, completar `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` y reiniciar Vite. Las variables VITE son públicas. Las preferencias de conexión guardadas en el navegador tienen prioridad sobre las variables de compilación. La base de datos aplica RLS independientemente de estas preferencias.

## Actualización desde la primera versión

Si ya ejecutaste el esquema anterior, ejecuta **solo** `public/supabase/002_product_suppliers.sql` una vez en el editor SQL. No vuelvas a ejecutar el esquema completo sobre tablas existentes. La migración conserva productos, existencias e historial, añade la tabla `product_suppliers`, la RPC `register_product` y un trigger para vincular recepciones. Recupera relaciones de las entradas anteriores. Luego recarga la aplicación.

Si aún no instalas la base, el esquema completo `public/supabase/schema.sql` ya incluye esta actualización.

## Catálogo de productos y proveedores

- Nueva sección Productos: registrar tipo, modelo, color, tamaño, costo, precio e imagen opcional. Cada combinación representa una variante.
- Elegir uno o varios proveedores, como mínimo uno. Se necesitan proveedores registrados previamente.
- Alta de producto con cero existencias. Registrar o editar no modifica stock. Para incrementar existencias, confirmar una entrada.
- Editar datos y proveedores mantiene las entradas históricas y sus etiquetas originales. El costo del catálogo refleja el último valor recibido o editado.
- Una variante duplicada muestra un error para editar el registro existente. Reintentar el mismo producto utiliza la misma UUID.
- Filtrar el catálogo por proveedor y consultar sus productos desde Proveedores.
- En Entrada de mercancía, la búsqueda muestra solo los productos del proveedor seleccionado. Una captura manual asocia ese proveedor con la variante al confirmar.
- Los vínculos almacenan proveedores asociados, sin un costo diferente por proveedor. Desmarcar uno afecta al catálogo, no al historial. Una nueva recepción desde ese proveedor vuelve a asociarlo.
- Los productos anteriores del modo demo recuperan sus proveedores del historial al cargar. Los productos sin historial quedan sin proveedor hasta editarlos.

## Comportamiento

- Entrada: proveedor, fecha, comprobante opcional, observaciones y hasta 100 variantes.
- Variante: tipo, modelo, color, tamaño, cantidad entera, costo y precio de venta por pieza.
- Imágenes JPG/PNG hasta 5 MB. Upload a bucket privado y visualización mediante URLs firmadas de una hora. Cada usuario puede leer solo su carpeta. Quitar la foto de una fila no borra imágenes de movimientos anteriores. Archivos subidos en entradas abandonadas pueden quedar sin referencia; la limpieza administrativa debe revisar referencias antes de borrarlos.
- Buscar un artículo existente agrega otra recepción de la misma variante. Modelo, tipo, color y tamaño normalizados identifican la variante. Se puede editar el catálogo desde Productos. No incluye salidas de inventario.
- Confirmar ejecuta `receive_merchandise`: valida propietario, inserta entrada y renglones, suma existencias y guarda todo en una sola transacción PostgreSQL. La UUID de solicitud permanece igual al reintentar desde la misma pantalla y evita el doble registro. No se conserva tras cerrar/recargar la captura: ante una respuesta incierta, revisar el historial antes de empezar otra entrada.
- Costo y precio en MXN, sin impuestos adicionales. El costo del catálogo refleja el último recibido; no es costo promedio ni cálculo contable de utilidad.
- Historial: últimas 100 entradas, reimpresión de sus datos originales sin afectar stock.
- No existen borradores. La captura incompleta vive en memoria y se pierde al salir/recargar.
- Cada usuario es dueño de su inventario. No incluye organizaciones, roles de empleados ni colaboración entre cuentas.

## Impresión

Formatos térmicos 50×30, 60×40 y 70×50 mm, y hoja A4 con etiquetas de 60×40 mm. Seleccionar el papel correcto, escala 100% y desactivar encabezados/pies en el diálogo de impresión. A4 es una cuadrícula genérica, no una plantilla de marca adhesiva. Revisar una muestra en la impresora real. Descripciones muy largas pueden requerir un formato mayor.

Una etiqueta por pieza por defecto. Máximo 1,000 etiquetas por lote para evitar saturar el navegador. Confirmar una entrada mayor sigue guardándola; imprimir artículos por separado y ajustar las copias desde la vista previa. La app abre el diálogo del navegador: no confirma que la impresora haya terminado. Se puede reimprimir desde el historial sin duplicar existencias.

## Modo demostración

Sin configuración Supabase, permite probar la operación con datos en localStorage del navegador. Se identifica en toda la app. No transfiere datos a la nube automáticamente. Las imágenes base64 pueden agotar la cuota local y provocar un error al confirmar. Usar imágenes pequeñas en demo. Los datos demo y reales están separados.

## Seguridad y validación

Tablas con RLS, solo lectura directa de productos/entradas y escritura por RPC autenticada. Supabase Storage privado con ruta por auth.uid. La RPC revisa proveedor, imagen, tipos y rangos, y serializa la misma solicitud con bloqueo transaccional. La aplicación usa React para escapar textos; no inserta HTML ingresado por usuarios.

Validación realizada: compilación de producción y pruebas unitarias del dominio. La integración real y la migración 002 deben verificarse después de crear tu proyecto y aplicar el esquema: dos cuentas separadas, confirmar/reintentar, subir una imagen y reimprimir. No se realizó una prueba de interfaz en navegador automatizado en este entorno. Sin credenciales no se ejecutó el SQL en una instancia remota ni se realizó una prueba de impresora física.

Documentación utilizada:
- https://supabase.com/docs/reference/javascript/auth-signinwithpassword
- https://supabase.com/docs/guides/storage/uploads/standard-uploads
- https://supabase.com/docs/guides/database/postgres/row-level-security

## Registro de ventas para el gerente
En Registro de ventas, busca los productos vendidos, captura cantidades y precios,
selecciona fecha y forma de pago y pulsa Registrar venta. No hay carrito público.
La venta queda en el historial y resta existencias. El catálogo no crea existencias.
Para una base ya instalada ejecuta `public/supabase/003_sales.sql` después de la
migración 002. Las instalaciones nuevas usan `public/supabase/schema.sql` completo.
La función register_sale valida la cuenta, bloquea las filas de productos, registra
la venta y descuenta stock en una transacción. Reintentar el mismo identificador
no descuenta dos veces. Los precios y nombres quedan guardados en el historial.
La demostración usa almacenamiento local; usa Supabase para operación real concurrente.
Verificación: 16 pruebas de dominio y build de producción. Falta ejecutar SQL en
el proyecto Supabase del usuario y verificar el flujo en navegador.

## Protección de proveedor, etiquetas pequeñas y reportes
- Al cambiar el proveedor con artículos capturados se solicita confirmación. Conservar
  mantiene proveedor y filas; confirmar cambia proveedor y vacía únicamente la captura.
- A4 con etiquetas 30 × 20 mm: 6 columnas × 12 filas, márgenes 10 mm y separación
  2 mm, 72 etiquetas por hoja. Imprimir al 100%, sin encabezados ni pies. Verificar
  compatibilidad con el troquel de la hoja adhesiva y una impresión de prueba.
- Reportes permite consultar desde/hasta: venta diaria (importe, operaciones, piezas
  y promedio) y productos más vendidos por piezas, separados por variante.
- Consulta paginada de ventas y sus renglones para superar el límite del historial.
  No requiere una migración adicional; necesita la migración 003 de ventas instalada.
- 18 pruebas de dominio y compilación verificadas. Prueba de navegador bloqueada
  por el entorno; pendientes verificación con Supabase real e impresión física.
