// src/P2P/controllers/p2p-buyer.controller.ts
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
  Query,
  ParseIntPipe,
  ParseFloatPipe,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { P2PBuyerService } from '../services/p2p-buyer.service';
import { CreateP2PBuyerDto } from '../dtos/create-p2p-buyer.dto';
import { UpdateP2PBuyerDto } from '../dtos/update-p2p-buyer.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';

@ApiTags('p2p/buyers')
@Controller('api/v1/buyers')
@ApiBearerAuth()
export class P2PBuyerController {
  constructor(private readonly p2pBuyerService: P2PBuyerService) {}

  @Post('createBuyerOrder')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Create a new P2P buy order' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'P2P buy order successfully created',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid input',
  })
  create(@Request() req, @Body() createP2PBuyerDto: CreateP2PBuyerDto) {
    return this.p2pBuyerService.create(req.user.userId, createP2PBuyerDto);
  }

  @Get('public')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Get all P2P buy orders with optional filterin',
  })
  @ApiQuery({
    name: 'userId',
    required: false,
    description: 'Filter by user ID',
  })
  @ApiQuery({
    name: 'buyCurrency',
    required: false,
    description: 'Filter by buy currency (e.g., NGN, CAD)',
  })
  @ApiQuery({
    name: 'sellCurrency',
    required: false,
    description: 'Filter by sell currency (e.g, NGN, CAD)',
  })
  @ApiQuery({
    name: 'rating',
    required: false,
    description: 'Filter by exact seller rating (0-5)',
  })
  @ApiQuery({
    name: 'exchangeRate',
    required: false,
    description: 'Filter by exact exchange rate',
  })
  @ApiQuery({
    name: 'completionTime',
    required: false,
    description: 'Filter by exact transaction duration in minutes',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Search by name, bank, exchange rate, or min limit',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    description: 'Page number (default: 1)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Items per page (default: 10)',
  })
  @ApiQuery({
    name: 'sortBy',
    required: false,
    enum: ['rating', 'exchangeRate', 'completionTime'],
    description: 'Field to sort by',
  })
  @ApiQuery({
    name: 'sortOrder',
    required: false,
    enum: ['ASC', 'DESC'],
    description: 'Sort order (ascending or descending)',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Return buy orders based on filters',
  })
  async findAll(
    @Request() req,
    @Query('sellCurrency') sellCurrency?: string,
    @Query('buyCurrency') buyCurrency?: string,
    @Query('rating') ratingStr?: string,
    @Query('exchangeRate') exchangeRateStr?: string,
    @Query('completionTime') completionTimeStr?: string,
    @Query('sortBy') sortBy?: string,
    @Query('search') search?: string,
    @Query('page') pageStr?: string,
    @Query('limit') limitStr?: string,
    @Query('sortOrder') sortOrder?: 'ASC' | 'DESC',
  ) {
    const userId = req.user.userId;
    console.log(userId, 'user');
    const rating = ratingStr ? Number(ratingStr) : undefined;
    const exchangeRate = exchangeRateStr ? Number(exchangeRateStr) : undefined;
    const completionTime = completionTimeStr
      ? Number(completionTimeStr)
      : undefined;

    const page = pageStr ? Number(pageStr) : 1;
    const limit = limitStr ? Number(limitStr) : 10;
    const skip = (page - 1) * limit;

    const { data, total } = await this.p2pBuyerService.findAll(
      userId,
      buyCurrency,
      sellCurrency,
      !isNaN(rating) ? rating : undefined,
      !isNaN(exchangeRate) ? exchangeRate : undefined,
      !isNaN(completionTime) ? completionTime : undefined,
      sortBy,
      sortOrder,
      search,
      skip,
      limit,
    );

    return {
      success: true,
      message: 'Buyers retrieved successfully',
      data,
      count: total,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      timestamp: new Date().toISOString(),
    };
  }
  @Get(':id')
  @ApiOperation({ summary: 'Get a specific P2P buy order by ID' })
  @ApiParam({ name: 'id', description: 'P2P buy order ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Return the buy order' })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Buy order not found',
  })
  findOne(@Request() req, @Param('id') id: string) {
    return this.p2pBuyerService.findOne(req.user.id, +id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a P2P buy order' })
  @ApiParam({ name: 'id', description: 'P2P buy order ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Buy order successfully updated',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Buy order not found',
  })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid input' })
  update(
    @Request() req,
    @Param('id') id: string,
    @Body() updateP2PBuyerDto: UpdateP2PBuyerDto,
  ) {
    return this.p2pBuyerService.update(req.user.id, +id, updateP2PBuyerDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Cancel a P2P buy order' })
  @ApiParam({ name: 'id', description: 'P2P buy order ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Buy order successfully cancelled',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Buy order not found',
  })
  cancel(@Request() req, @Param('id') id: string) {
    return this.p2pBuyerService.cancel(req.user.id, +id);
  }

  @Post('calculate-conversion-buyer/:buyerId')
  @ApiOperation({ summary: 'Calculate conversion for buyer order' })
  @ApiParam({ name: 'buyerId', description: 'Buyer order ID', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Conversion calculated successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid buyer ID or conversion parameters',
  })
  @ApiResponse({ status: 404, description: 'Buyer order not found' })
  calculateConversionForBuyer(
    @Param('buyerId') buyerIdStr: string,
    @Body()
    conversionDto: {
      amount: number;
      fromCurrency?: string;
      toCurrency?: string;
    },
  ) {
    const buyerId = parseInt(buyerIdStr, 10);

    if (isNaN(buyerId)) {
      throw new BadRequestException('Invalid buyer ID');
    }

    return this.p2pBuyerService.calculateConversionForBuyer(
      buyerId,
      conversionDto.amount,
      conversionDto.fromCurrency,
      conversionDto.toCurrency,
    );
  }
}
