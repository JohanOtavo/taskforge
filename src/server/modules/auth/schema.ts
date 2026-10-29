import { z } from "zod";

import { normalizeEmail } from "@/lib/identifiers";

/// `.strict()` en toda entrada: descartar claves desconocidas es lo que evita
/// la asignacion masiva de campos como `orgId` o `role`.

const email = z
  .string()
  .trim()
  .min(3)
  .max(254)
  .email("Introduce un correo valido.")
  .transform(normalizeEmail);

/// Longitud sobre complejidad: una frase larga resiste mejor que "P@ssw0rd".
const password = z
  .string()
  .min(12, "La contrasena debe tener al menos 12 caracteres.")
  // Limite superior: scrypt sobre una entrada de 1 MB es una denegacion de
  // servicio gratuita.
  .max(200, "La contrasena no puede superar 200 caracteres.");

export const registerSchema = z
  .object({
    name: z.string().trim().min(2, "Indica tu nombre.").max(120),
    email,
    password,
    // Opcional, como en Trello: primero existe la cuenta; el espacio de
    // trabajo se crea despues, o se entra a uno por invitacion.
    orgName: z.string().trim().min(2, "El nombre debe tener al menos 2 caracteres.").max(120).optional(),
  })
  .strict();

export const loginSchema = z
  .object({
    email,
    password: z.string().min(1, "Introduce tu contrasena.").max(200),
  })
  .strict();

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
