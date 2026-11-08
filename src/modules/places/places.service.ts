import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExternalContactEntity } from './entities/external-contact.entity';
import { PlaceEntity } from './entities/place.entity';

@Injectable()
export class PlacesService {
  constructor(
    @InjectRepository(PlaceEntity)
    private readonly places: Repository<PlaceEntity>,
    @InjectRepository(ExternalContactEntity)
    private readonly contacts: Repository<ExternalContactEntity>,
  ) {}

  findPlaceById(id: string): Promise<PlaceEntity | null> {
    return this.places.findOne({ where: { id, isActive: true } });
  }

  listMusterPoints(): Promise<PlaceEntity[]> {
    return this.places.find({
      where: { isMusterPoint: true, isActive: true, isBlocked: false },
      order: { name: 'ASC' },
    });
  }

  async getExternalContact(id: string): Promise<ExternalContactEntity> {
    const row = await this.contacts.findOne({ where: { id, isActive: true } });
    if (!row) throw new NotFoundException('external_contact_not_found');
    return row;
  }

  listExternalContacts(): Promise<ExternalContactEntity[]> {
    return this.contacts.find({
      where: { isActive: true },
      order: { agencyName: 'ASC' },
    });
  }
}
