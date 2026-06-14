import { ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser } from './current-user.decorator';

/**
 * Permite acțiunea dacă userul e ADMIN sau e chiar doctorul (DoctorProfile.id).
 * Aruncă 403 altfel.
 */
export function assertDoctorOwnerOrAdmin(
  user: AuthUser,
  doctorProfileId: string,
): void {
  if (user.role === Role.ADMIN) return;
  if (user.role === Role.DOCTOR && user.doctorProfileId === doctorProfileId) {
    return;
  }
  throw new ForbiddenException('Nu ai dreptul să modifici acest doctor');
}
