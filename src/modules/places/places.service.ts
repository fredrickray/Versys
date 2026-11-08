import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExternalContactEntity } from './entities/external-contact.entity';
import { PlaceEntity } from './entities/place.entity';

export const USSD_LOCATION_GROUPS: ReadonlyArray<{
  key: string;
  label: string;
  ussdNumber: number;
}> = [
  { key: 'hostels', label: 'Hostels', ussdNumber: 1 },
  { key: 'faculties', label: 'Faculties', ussdNumber: 2 },
  { key: 'halls_and_chapel', label: 'Halls & Chapel', ussdNumber: 3 },
  { key: 'sports_and_gate', label: 'Sports & Gate', ussdNumber: 4 },
];

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

  findByCode(code: string): Promise<PlaceEntity | null> {
    return this.places.findOne({ where: { code, isActive: true } });
  }

  listByGroup(groupKey: string): Promise<PlaceEntity[]> {
    return this.places.find({
      where: { groupKey, isActive: true },
      order: { ussdNumber: 'ASC' },
    });
  }

  findByGroupAndUssdNumber(
    groupKey: string,
    ussdNumber: number,
  ): Promise<PlaceEntity | null> {
    return this.places.findOne({
      where: { groupKey, ussdNumber, isActive: true },
    });
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
