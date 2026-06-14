import { Role } from '@prisma/client';

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  doctorProfileId: string | null;
}