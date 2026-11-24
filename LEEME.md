# HZ CARS · Web + Panel de gestión

Contiene dos cosas:

- **La web pública** (`public/index.html`): lee los coches y motos del sistema, así que no hay que tocar código para cambiar nada.
- **El panel de gestión** (`/admin`): para subir fotos, poner precios y descripciones, marcar *Disponible / Reservado / Vendido* y ver las solicitudes de «Vende tu coche» y «Contacto».

Todo se aloja en **Netlify** (datos y fotos incluidos), sin base de datos aparte ni cuotas extra.

---

## Para publicarlo (una sola vez)

1. Crea una cuenta gratuita en https://app.netlify.com
2. **Add new site → Deploy manually** y sube esta carpeta (o conecta un repositorio de GitHub con ella).
   > Importante: la carpeta debe incluir `netlify/functions` y `package.json`. Si subes solo `public` la web se verá, pero el panel no funcionará.
3. En el sitio: **Site configuration → Environment variables** y crea dos variables:
   - `ADMIN_PASSWORD` → la contraseña con la que entrará la persona al panel (larga y difícil).
   - `SESSION_SECRET` → una frase aleatoria cualquiera (por ejemplo, 30 letras y números).
4. Vuelve a desplegar (**Deploys → Trigger deploy**) para que cojan las variables.
5. Conecta tu dominio en **Domain management** (por ejemplo, hzcars.es).

El panel está en `tudominio.es/admin`.

---

## Cómo se usa el panel (guía para quien lo gestione)

**Entrar:** `tudominio.es/admin` + la contraseña. Funciona bien desde el móvil.

**Añadir un coche o moto:** botón rojo *Añadir coche* → rellena marca, modelo y precio (lo demás es opcional) → *Añadir fotos* (puedes elegir varias o hacerlas con la cámara) → *Guardar*. Se ve en la web al instante.

**Marcar como vendido o reservado:** en la lista, pulsa *Reservado* o *Vendido* en el propio coche. Un coche vendido sigue en la web, al final de la lista y con la etiqueta VENDIDO; así los clientes ven que vendéis. Si prefieres que desaparezca, pulsa *Ocultar*.

**Cambiar precio, descripción o fotos:** *Editar*. En las fotos, la primera es la portada; pulsa *Portada* en otra para cambiarla o ✕ para quitarla.

**Solicitudes:** pestaña *Solicitudes*. Cada mensaje trae botones para llamar o escribir por WhatsApp. El número rojo indica las nuevas.

---

## Qué cambiar de la web (una vez)

En `public/index.html` busca y sustituye:
- La dirección y el horario (`[Añadir dirección exacta del local]` y `[Añadir horario]`).
- El teléfono `643 233 020` / `34643233020` si cambia.
- Los textos de garantía y financiación, para que reflejen lo que ofrecéis de verdad.

## Notas técnicas

- Datos: `Netlify Blobs` (vehículos, fotos y solicitudes). Las fotos se reducen automáticamente a 1600 px antes de subirse.
- API: `netlify/functions/api.mjs`. La sesión del panel dura 30 días. Tras 8 contraseñas erróneas seguidas, el acceso se bloquea 15 minutos.
- Vista de prueba sin servidor: abrir `public/index.html?demo` muestra coches de ejemplo.
- Si el panel dice «Falta configurar ADMIN_PASSWORD», revisa el paso 3 y vuelve a desplegar.

## Finanzas (Admin → pestaña "Finanzas")
- Movimientos de ingreso/gasto con fecha, categoría e importe, asociados o no a un vehículo.
- Filtros de tiempo (mes, trimestre, año, últimos 12 meses, personalizado) con comparación frente al periodo anterior.
- "Por vehículo": compra, gastos, coste total, venta, beneficio, margen y días en stock.
- "Costes fijos": se repiten solos cada mes o año (alquiler, seguros, autónomos…).
- Resumen con gráficas, reparto de cada 100 €, punto de equilibrio y capital parado en stock.
- Al marcar un coche como Vendido, el panel propone registrar el ingreso de la venta.
- Exportación a CSV. Los importes son los introducidos: no se calcula IVA ni REBU.
