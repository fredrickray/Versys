import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExternalContactEntity } from './entities/external-contact.entity';
import { PlaceEntity } from './entities/place.entity';
import { PlacesService } from './places.service';

@Module({
  imports: [TypeOrmModule.forFeature([PlaceEntity, ExternalContactEntity])],
  providers: [PlacesService],
  exports: [PlacesService, TypeOrmModule],
})
export class PlacesModule {}
