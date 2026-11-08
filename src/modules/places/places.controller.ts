import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PlacesService } from './places.service';

@Controller('places')
@UseGuards(JwtAuthGuard)
export class PlacesController {
  constructor(private readonly places: PlacesService) {}

  @Get('muster')
  muster() {
    return this.places.listMusterPoints();
  }

  @Get('external-contacts')
  externalContacts() {
    return this.places.listExternalContacts();
  }
}
