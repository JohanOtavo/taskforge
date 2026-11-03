import { z } from "zod";

export const updateProfileSchema = z
  .object({ name: z.string().trim().min(2, "Indica tu nombre.").max(120) })
  .strict();

export const changePasswordSchema = z
  .object({
    // Ausente en cuentas de Google que aun no tienen contrasena.
    currentPassword: z.string().max(200).optional(),
    newPassword: z
      .string()
      .min(12, "La contraseña debe tener al menos 12 caracteres.")
      .max(200, "La contraseña no puede superar 200 caracteres."),
  })
  .strict();

export const notificationPrefsSchema = z
  .object({
    notifyAssigned: z.boolean(),
    notifyComments: z.boolean(),
    notifyMembership: z.boolean(),
  })
  .strict();

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type NotificationPrefsInput = z.infer<typeof notificationPrefsSchema>;
