// src/P2P/controllers/p2p-seller.controller.ts
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
  ParseIntPipe,
  Query,
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
  ApiBody,
} from '@nestjs/swagger';
import { P2PSellerService } from '../services/p2p-seller.service';
import { CreateP2PSellerDto } from '../dtos/create-p2p-seller.dto';
import { UpdateP2PSellerDto } from '../dtos/update-p2p-seller.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { GetSellerOrdersFilterDto } from '../dtos/getSeller.dto';

@ApiTags('p2p/sellers')
@Controller('api/v1/p2p/sellers')
@ApiBearerAuth()
export class P2PSellerController {
  constructor(private readonly p2pSellerService: P2PSellerService) {}

  @Post('createSellerOrder')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Create a new P2P sell order' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'P2P sell order successfully created',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid input',
  })
  create(@Request() req, @Body() createP2PSellerDto: CreateP2PSellerDto) {
    return this.p2pSellerService.create(req.user.userId, createP2PSellerDto);
  }

  @Get('findAllSellerOrders')
  @ApiOperation({
    summary: 'Get all P2P sell orders for the authenticated user',
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'Return all sell orders' })
  findAll(@Request() req) {
    return this.p2pSellerService.findAll(req.user.userId);
  }

  @Get('public')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get all public P2P sell orders for trading' })
  @ApiQuery({
    name: 'sellCurrency',
    required: false,
    description: 'Filter by sell currency (e.g., NGN, CAD)',
  })
  @ApiQuery({
    name: 'buyCurrency',
    required: false,
    description: 'Filter by buy currency (e.g., NGN, CAD)',
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
    name: 'page',
    required: false,
    description: 'Page number for pagination (default: 1)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Number of records per page (default: 10)',
  })
  @ApiQuery({
    name: 'completionTime',
    required: false,
    description: 'Filter by exact transaction duration in minutes',
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
    description: 'Return all active sell orders',
  })
  async findPublic(
    @Request() req,
    @Query('sellCurrency') sellCurrency?: string,
    @Query('buyCurrency') buyCurrency?: string,
    @Query('rating') ratingStr?: string,
    @Query('exchangeRate') exchangeRateStr?: string,
    @Query('completionTime') completionTimeStr?: string,
    @Query('search') search?: string,
    @Query('page') pageStr?: string,
    @Query('limit') limitStr?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: 'ASC' | 'DESC',
  ) {
    // Safely parse numeric values
    const userId = req.user.userId;
    console.log('Authenticated user ID:', userId);
    const rating = ratingStr ? Number(ratingStr) : undefined;
    const exchangeRate = exchangeRateStr ? Number(exchangeRateStr) : undefined;
    const completionTime = completionTimeStr
      ? Number(completionTimeStr)
      : undefined;
    const page = pageStr ? Number(pageStr) : 1;
    const limit = limitStr ? Number(limitStr) : 10;
    const skip = (page - 1) * limit;

    const { data, total } = await this.p2pSellerService.findPublic(
      userId,
      sellCurrency,
      buyCurrency,
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
      message: 'Sellers retrieved successfully',
      data,
      count: total,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      timestamp: new Date().toISOString(),
    };
  }

  @Get('sell-orders')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: "Get seller's own orders",
    description:
      'Retrieve paginated list of sell orders with filtering by status, awaiting seller, and negotiation status',
  })
  @ApiQuery({ type: GetSellerOrdersFilterDto })
  @ApiResponse({
    status: 200,
    description: 'Sell orders retrieved successfully',
    schema: {
      example: {
        success: true,
        data: {
          orders: [
            {
              id: 123,
              sellCurrency: 'CAD',
              buyCurrency: 'NGN',
              exchangeRate: 1200,
              availableAmount: 5000,
              status: 'OPEN',
              awaitingSeller: true,
              isNegotiating: false,
              createdAt: '2025-09-05T18:30:00.000Z',
            },
          ],
          total: 15,
          page: 1,
          limit: 20,
          totalPages: 1,
        },
      },
    },
  })
  getMyOrders(
    @Request() req: any,
    @Query() filterDto: GetSellerOrdersFilterDto,
  ) {
    return this.p2pSellerService.getSellerOrders(req.user.userId, filterDto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific P2P sell order by ID' })
  @ApiParam({ name: 'id', description: 'P2P sell order ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Return the sell order' })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Sell order not found',
  })
  findOne(
    @Request() req,
    @Param(
      'id',
      new ParseIntPipe({ errorHttpStatusCode: HttpStatus.BAD_REQUEST }),
    )
    id: number,
  ) {
    return this.p2pSellerService.findOne(req.user.id, id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Update a P2P sell order' })
  @ApiParam({ name: 'id', description: 'P2P sell order ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Sell order successfully updated',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Sell order not found',
  })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid input' })
  update(
    @Request() req,
    @Param(
      'id',
      new ParseIntPipe({ errorHttpStatusCode: HttpStatus.BAD_REQUEST }),
    )
    id: number,
    @Body() updateP2PSellerDto: UpdateP2PSellerDto,
  ) {
    return this.p2pSellerService.update(
      req.user.userId,
      id,
      updateP2PSellerDto,
    );
  }

  @Post(':sellOrderId/request-negotiation')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Request to negotiate with a seller (no payload required)',
  })
  @ApiParam({
    name: 'sellOrderId',
    description: 'Seller Order ID',
    type: 'number',
  })
  @ApiResponse({
    status: 200,
    description: 'Negotiation request sent successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Seller order not available for negotiation',
  })
  @ApiResponse({ status: 403, description: 'Cannot negotiate with yourself' })
  @ApiResponse({ status: 404, description: 'Seller order not found' })
  async requestNegotiation(
    @Param('sellOrderId', ParseIntPipe) sellOrderId: number,
    @Request() req,
  ) {
    return await this.p2pSellerService.requestNegotiation(
      sellOrderId,
      req.user.userId,
    );
  }
  @Post('calculate-conversion/:sellerId')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Calculate conversion for a sell order with negotiation support',
    description:
      "Calculates currency conversion. Uses negotiated rate if active negotiation exists, otherwise uses seller's original rate.",
  })
  @ApiParam({
    name: 'sellerId',
    description: 'ID of the seller/sell order',
    type: 'number',
    example: 123,
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        amount: {
          type: 'number',
          description: 'Amount to convert',
          example: 1000,
        },
        fromCurrency: {
          type: 'string',
          description: 'Currency being paid with',
          example: 'NGN',
          enum: ['NGN', 'CAD'],
        },
        toCurrency: {
          type: 'string',
          description: 'Currency to receive',
          example: 'CAD',
          enum: ['NGN', 'CAD'],
        },
      },
      required: ['amount'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Conversion calculated successfully',
    schema: {
      example: {
        success: true,
        data: {
          fromAmount: 1200000,
          fromCurrency: 'NGN',
          toAmount: 1000,
          toCurrency: 'CAD',
          rate: 1200,
          rateSource: 'negotiated',
          isUsingNegotiatedRate: true,
          originalSellerRate: 1200,
          negotiationId: 456,
          rateComparison: {
            originalRate: 1200,
            negotiatedRate: 1250,
            difference: 50,
            percentageChange: 4.17,
            buyerImpact: 'pays_more',
          },
        },
      },
    },
  })
  async calculateConversion(
    @Param('sellerId', ParseIntPipe) sellerId: number,
    @Body()
    conversionDto: {
      amount: number;
      fromCurrency?: string;
      toCurrency?: string;
    },
    @Request() req,
  ) {
    try {
      const userId = req.user?.userId;

      if (isNaN(sellerId)) {
        throw new BadRequestException('Invalid seller ID');
      }

      const result =
        await this.p2pSellerService.calculateConversionWithNegotiation(
          sellerId,
          userId, // Pass current user ID to check for negotiations
          conversionDto.amount,
          conversionDto.fromCurrency,
          conversionDto.toCurrency,
        );

      return {
        success: true,
        message: result.isUsingNegotiatedRate
          ? 'Conversion calculated using your negotiated rate'
          : "Conversion calculated using seller's standard rate",
        data: result,
      };
    } catch (error) {
      throw error;
    }
  }
  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Cancel a P2P sell order' })
  @ApiParam({ name: 'id', description: 'P2P sell order ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Sell order successfully cancelled',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Sell order not found',
  })
  cancel(
    @Request() req,
    @Param(
      'id',
      new ParseIntPipe({ errorHttpStatusCode: HttpStatus.BAD_REQUEST }),
    )
    id: number,
  ) {
    return this.p2pSellerService.cancel(req.user.userId, id);
  }
}
