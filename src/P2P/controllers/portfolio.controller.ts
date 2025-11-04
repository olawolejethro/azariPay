// src/P2P/controllers/portfolio.controller.ts
import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Request,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { PortfolioService } from '../services/portfolio.service';
import { CreatePortfolioDto } from '../dtos/portfolio.dto';
import { UpdatePortfolioDto } from '../dtos/update-portfolio.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';

@ApiTags('p2p/portfolios')
@Controller('api/v1/p2p/portfolios')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class PortfolioController {
  constructor(private readonly portfolioService: PortfolioService) {}

  @Post('createPortfolio')
  @ApiOperation({ summary: 'Create a new portfolio' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Portfolio successfully created',
  })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid input' })
  create(@Request() req, @Body() createPortfolioDto: CreatePortfolioDto) {
    return this.portfolioService.create(req.user.userId, createPortfolioDto);
  }

  @Get('findAllPortfolios')
  @ApiOperation({ summary: 'Get all portfolios for the authenticated user' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Return all portfolios' })
  async findAll(@Request() req) {
    const data = await this.portfolioService.findAll(req.user.UserId);

    return {
      success: true,
      message: 'portfolio retrieved successfully',
      data: data,
      count: data.length,
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific portfolio by ID' })
  @ApiParam({ name: 'id', description: 'Portfolio ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Return the portfolio' })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Portfolio not found',
  })
  findOne(@Request() req, @Param('id') id: number) {
    return this.portfolioService.findOne(req.user.id, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a portfolio' })
  @ApiParam({ name: 'id', description: 'Portfolio ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Portfolio successfully updated',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Portfolio not found',
  })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid input' })
  update(
    @Request() req,
    @Param('id') id: number,
    @Body() updatePortfolioDto: UpdatePortfolioDto,
  ) {
    return this.portfolioService.update(req.user.id, id, updatePortfolioDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a portfolio' })
  @ApiParam({ name: 'id', description: 'Portfolio ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Portfolio successfully deleted',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Portfolio not found',
  })
  remove(@Request() req, @Param('id') id: number) {
    return this.portfolioService.remove(req.user.id, id);
  }
}
