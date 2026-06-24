# Observaciones para el Tesorero — Cálculo de Deudas e Intereses

Consideraciones importantes al momento de generar el archivo de texto para el banco.

---

## 1. Periodicidad de emisión de facturas

| Tipo | Periodicidad | ¿Cómo se calcula el interés? |
|------|-------------|------------------------------|
| **Catastro Urbano** | **Anual** (1 vez por año) | Interés empieza en **enero del año de emisión**. Si es año actual → 0 interés (COOTAD). |
| **Catastro Rural** | **Anual** (1 vez por año) | Misma regla que urbano. |
| **Agua Potable** | **Mensual** (cada mes) | Interés empieza desde el **mes siguiente** a la creación de la factura. |

---

## 2. Composición del valor de cada factura

```
Valor Total = Nominal + Interés + Mora + Descuento + Recargo
```

Los componentes se calculan de la siguiente forma:

| Componente | Descripción |
|------------|-------------|
| **Nominal** | Valor base de la factura emitida por el SIIM |
| **Interés** | Porcentaje acumulado mes a mes según la tabla de intereses del SIIM |
| **Mora** | 10% del impuesto predial (solo catastro de años anteriores) |
| **Descuento** | Descuento por pronto pago (solo catastro año actual, valor negativo) |
| **Recargo** | Recargo por segundo semestre en catastro urbano (valor positivo) |

---

## 3. Los intereses NO son fijos — cambian con el tiempo

El interés se calcula **en el momento exacto de procesar el corte**, usando la tabla de porcentajes mensuales del SIIM.

**Ejemplo real:**
- Factura de Agua de Enero 2025, procesada el **1 de Junio 2025** → intereses de enero a junio
- La misma factura procesada el **1 de Julio 2025** → intereses de enero a julio (un mes más)
- **Cada día que pasa, el interés puede aumentar**

> ⚠️ Si se procesa el corte un día y lo vuelve a procesar al día siguiente, los valores pueden variar (especialmente en agua potable que es mensual y en el descuento pronto pago de catastro que cambia cada quincena).

---

## 4. Descuento y recargo por pronto pago

Aplica solo a **catastro del año actual**. Se calcula con la **fecha actual del servidor** (no la fecha de corte).

| Período | Urbano | Rural |
|---------|--------|-------|
| **Enero - Junio (1.er semestre)** | Descuento escalonado por quincena (9 % → 1 %) | Descuento fijo **10 %** |
| **Julio - Diciembre (2.do semestre)** | **Recargo +10 %** | Sin recargo |
| **Años anteriores** | Sin descuento ni recargo | Sin descuento ni recargo |

---

## 5. Mora

- **10 %** del impuesto predial para facturas de catastro de **años anteriores al actual**
- No aplica a agua potable
- No aplica a catastro del año actual

---

## 6. Formato del archivo TXT (para el banco)

El archivo TXT se genera con valores en **centavos** (sin decimales), separado por tabs:

```
CO  [contrapartida]  USD  [centavos]  REC  [referencia]  N  [nombre]
```

**Ejemplos de referencias generadas:**

| Tipo | Ejemplo de referencia |
|------|----------------------|
| **Catastro Urbano** | `Catastro urbano anios 2022 a 2025` |
| **Catastro Rural** | `Catastro rural anios 2022 a 2025` (años no consecutivos) |
| **Agua Potable** | `[nombre cliente] Emisiones: 202501 a 202506` |

---

## 7. Recomendaciones

1. **Procesar el corte el mismo día que se entrega el archivo al banco** para que los valores coincidan exactamente.
2. Si se necesita el archivo para una fecha futura, procesarlo **el mismo día del envío**, no antes.
3. Activar la opción **"Detalle de deuda"** si se quiere ver el desglose por factura individual (1 registro por ano o mes si es AAPP).
4. El Excel con detalle muestra cada factura con todos sus componentes: Nominal, Interés, Mora, Descuento, Recargo y Total.
5. **Descargar el reporte inmediatamente después de procesarlo**, antes de que otro usuario procese un nuevo corte (eso inactivaría el corte activo actual).

---

## 8. Preguntas frecuentes

**¿Por qué el total del archivo no coincide con el total de ayer si procesé el mismo corte?**
Porque los intereses se siguen acumulando día a día y el descuento pronto pago depende de la fecha actual.

**¿El archivo TXT es el que recibe el banco?**
Sí, el banco recibe el archivo TXT con los valores en centavos. El Excel es un respaldo para revisión interna.

**¿Qué pasa si alguien más procesa un corte mientras yo estoy revisando?**
El corte activo se desactiva y el nuevo corte pasa a ser el activo. Los archivos del corte anterior ya no estarán disponibles para descarga desde el sistema (aunque el histórico se conserva).
