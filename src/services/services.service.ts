import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';

@Injectable()
export class ServicesService {
  constructor(private readonly prisma: PrismaService) {}

  findAllPublic() {
    return this.prisma.service.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
    });
  }

  create(dto: CreateServiceDto) {
    return this.prisma.service.create({ data: dto });
  }

  async update(id: string, dto: UpdateServiceDto) {
    await this.ensureExists(id);
    return this.prisma.service.update({ where: { id }, data: dto });
  }

  async softDelete(id: string) {
    await this.ensureExists(id);
    return this.prisma.service.update({
      where: { id },
      data: { active: false },
    });
  }

  private async ensureExists(id: string) {
    const service = await this.prisma.service.findUnique({ where: { id } });
    if (!service) {
      throw new NotFoundException('Serviciul nu a fost găsit');
    }
  }
}
