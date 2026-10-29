import type { z } from "zod";

/// Extrae de un FormData SOLO las claves que el esquema declara.
///
/// React inyecta campos propios en los formularios de Server Actions
/// (`$ACTION_REF_1`, `$ACTION_KEY`, ...). Con `Object.fromEntries(formData)`
/// esos campos entran en el objeto y `.strict()` rechaza la peticion entera,
/// asi que el formulario falla siempre y el mensaje de error no dice por que.
///
/// Filtrar por el shape del esquema conserva el valor de `.strict()` donde
/// importa de verdad: una peticion JSON fabricada a mano que intente colar
/// `orgId` o `role` sigue siendo rechazada.
export function parseForm<Shape extends z.ZodRawShape>(
  schema: z.ZodObject<Shape>,
  formData: FormData,
) {
  const values: Record<string, FormDataEntryValue> = {};

  for (const key of Object.keys(schema.shape)) {
    const value = formData.get(key);
    // Una clave ausente se deja fuera para que los `.optional()` y los
    // valores por defecto del esquema funcionen.
    if (value !== null && value !== "") values[key] = value;
  }

  return schema.safeParse(values);
}
