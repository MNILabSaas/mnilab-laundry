import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { normalizeCustomerPhone } from '../common/utils/phone.js';
import { toSafeLikeContain } from '../common/utils/security.js';
import { Customer } from './customer.entity.js';
import type {
  CreateCustomerDto,
  ListCustomersQueryDto,
  UpdateCustomerDto,
} from './dto/customer.dto.js';

@Injectable()
export class CustomersService {
  constructor(
    @InjectRepository(Customer)
    private readonly customersRepo: Repository<Customer>,
  ) {}

  async list(tenantId: string, query: ListCustomersQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 25;
    const qb = this.customersRepo
      .createQueryBuilder('c')
      .where('c.tenantId = :tenantId', { tenantId });

    if (query.search) {
      const pattern = toSafeLikeContain(query.search);
      qb.andWhere(`(c.name ILIKE :p ESCAPE '\\' OR c.phone ILIKE :p ESCAPE '\\')`, {
        p: pattern,
      });
    }

    const [items, total] = await qb
      .orderBy('c.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { items, total, page, limit };
  }

  async getById(id: string, tenantId: string) {
    const customer = await this.customersRepo.findOne({
      where: { id, tenantId },
    });
    if (!customer) throw new NotFoundException('Pelanggan tidak ditemukan');
    return customer;
  }

  async create(tenantId: string, dto: CreateCustomerDto) {
    const normalizedPhone = normalizeCustomerPhone(dto.phone);
    if (!normalizedPhone) {
      throw new BadRequestException(
        'Nomor WhatsApp pelanggan harus format 08... (11-13 digit)',
      );
    }

    const existing = await this.customersRepo.findOne({
      where: { tenantId, phone: normalizedPhone },
    });
    if (existing) {
      throw new ConflictException('Nomor WhatsApp pelanggan sudah terdaftar');
    }

    return this.customersRepo.save(
      this.customersRepo.create({
        tenantId,
        name: dto.name,
        phone: normalizedPhone,
        address: dto.address ?? null,
        notes: dto.notes ?? null,
      }),
    );
  }

  async update(id: string, tenantId: string, dto: UpdateCustomerDto) {
    const customer = await this.getById(id, tenantId);
    if (dto.phone !== undefined) {
      const normalized = normalizeCustomerPhone(dto.phone);
      if (!normalized) {
        throw new BadRequestException(
          'Nomor WhatsApp pelanggan harus format 08... (11-13 digit)',
        );
      }
      customer.phone = normalized;
    }
    if (dto.name !== undefined) customer.name = dto.name;
    if (dto.address !== undefined) customer.address = dto.address;
    if (dto.notes !== undefined) customer.notes = dto.notes;
    return this.customersRepo.save(customer);
  }
}
