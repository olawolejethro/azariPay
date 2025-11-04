// src/negotiations/controllers/negotiation.controller.ts
import {
  Controller,
  Post,
  Put,
  Get,
  Param,
  Body,
  UseGuards,
  Request,
  ParseIntPipe,
  BadRequestException,
  Delete,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import {
  UpdateNegotiationRateDto,
  RespondToNegotiationDto,
} from '../dtos/negotiation.dto';
import { NegotiationService } from '../services/p2p-trade/negotiation.service';

@Controller('api/v1/negotiations')
@ApiTags('Negotiations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
export class NegotiationController {
  constructor(private readonly negotiationService: NegotiationService) {}

  @Post('sell-order/:sellOrderId/create')
  @ApiOperation({
    summary: 'Create a new negotiation for a sell order',
    description:
      'Buyer initiates rate negotiation with a seller. Creates 24-hour negotiation window.',
  })
  @ApiParam({
    name: 'sellOrderId',
    description: 'ID of the sell order to negotiate on',
    type: 'number',
    example: 123,
  })
  @ApiResponse({
    status: 201,
    description: 'Negotiation created successfully',
    schema: {
      example: {
        success: true,
        message: 'Negotiation created successfully',
        data: {
          id: 1,
          sellOrderId: 123,
          buyerId: 456,
          sellerId: 789,
          proposedRate: 1200,
          originalRate: 1200,
          status: 'pending',
          expiresAt: '2025-09-06T07:46:23.571Z',
          createdAt: '2025-09-05T07:46:23.571Z',
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description:
      'Bad request - Cannot negotiate with own order or active negotiation exists',
    schema: {
      example: {
        statusCode: 400,
        message: 'Active negotiation already exists',
        error: 'Bad Request',
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Sell order not found',
    schema: {
      example: {
        statusCode: 404,
        message: 'Sell order not found',
        error: 'Not Found',
      },
    },
  })
  async createNegotiation(
    @Param('sellOrderId', ParseIntPipe) sellOrderId: number,
    @Request() req,
  ) {
    try {
      const buyerId = req.user.userId;

      const negotiation = await this.negotiationService.createNegotiation(
        sellOrderId,
        buyerId,
      );

      return {
        success: true,
        message:
          'Negotiation created successfully. You can now discuss rates with the seller.',
        data: {
          id: negotiation.id,
          sellOrderId: negotiation.sellOrderId,
          buyerId: negotiation.buyerId,
          sellerId: negotiation.sellerId,
          proposedRate: negotiation.proposedRate,
          originalRate: negotiation.originalRate,
          status: negotiation.status,
          expiresAt: negotiation.expiresAt,
          createdAt: negotiation.createdAt,
          timeRemaining: this.calculateTimeRemaining(negotiation.expiresAt),
        },
      };
    } catch (error) {
      throw error;
    }
  }

  @Put(':negotiationId/rate')
  @ApiOperation({
    summary: 'Update negotiation rate',
    description:
      'Seller proposes new exchange rate (max 20% deviation from original)',
  })
  @ApiParam({
    name: 'negotiationId',
    description: 'ID of the negotiation',
    type: 'number',
  })
  @ApiBody({ type: UpdateNegotiationRateDto })
  @ApiResponse({
    status: 200,
    description: 'Rate updated successfully',
  })
  async updateNegotiationRate(
    @Param('negotiationId', ParseIntPipe) negotiationId: number,
    @Body() updateDto: UpdateNegotiationRateDto,
    @Request() req,
  ) {
    const sellerId = req.user.userId;

    const negotiation = await this.negotiationService.updateNegotiationRate(
      negotiationId,
      sellerId,
      updateDto,
    );

    return {
      success: true,
      message: 'Rate updated successfully. Buyer has been notified.',
      data: negotiation,
    };
  }

  @Post(':negotiationId/respond')
  @ApiOperation({
    summary: 'Respond to negotiation',
    description: 'Buyer accepts or declines the proposed rate',
  })
  @ApiParam({
    name: 'negotiationId',
    description: 'ID of the negotiation',
    type: 'number',
  })
  @ApiBody({ type: RespondToNegotiationDto })
  @ApiResponse({
    status: 200,
    description: 'Response recorded successfully',
  })
  async respondToNegotiation(
    @Param('negotiationId', ParseIntPipe) negotiationId: number,
    @Body() responseDto: RespondToNegotiationDto,
    @Request() req: any,
  ) {
    const buyerId = req.user.userId;

    const negotiation = await this.negotiationService.respondToNegotiation(
      negotiationId,
      buyerId,
      responseDto,
    );

    const message =
      'Rate accepted! You can now proceed to create a trade with the agreed rate.';

    return {
      success: true,
      message: message,
      data: negotiation,
    };
  }

  //   @Get(':negotiationId')
  //   @ApiOperation({
  //     summary: 'Get negotiation details',
  //     description: 'Retrieve details of a specific negotiation'
  //   })
  //   @ApiParam({
  //     name: 'negotiationId',
  //     description: 'ID of the negotiation',
  //     type: 'number'
  //   })
  //   @ApiResponse({
  //     status: 200,
  //     description: 'Negotiation details retrieved successfully',
  //   })
  //   async getNegotiation(
  //     @Param('negotiationId', ParseIntPipe) negotiationId: number,
  //     @Request() req: any,
  //   ) {
  //     const userId = req.user.id;

  //     const negotiation = await this.negotiationService.getNegotiationById(
  //       negotiationId,
  //       userId,
  //     );

  //     return {
  //       success: true,
  //       data: {
  //         ...negotiation,
  //         timeRemaining: this.calculateTimeRemaining(negotiation.expiresAt),
  //         isExpired: new Date() > negotiation.expiresAt,
  //       }
  //     };
  //   }

  @Get('sell-order/:sellOrderId/active')
  @ApiOperation({
    summary: 'Get active negotiation for sell order',
    description:
      'Check if user has active negotiation with specific sell order',
  })
  @ApiParam({
    name: 'sellOrderId',
    description: 'ID of the sell order',
    type: 'number',
  })
  @ApiResponse({
    status: 200,
    description: 'Active negotiation status retrieved',
  })
  async getActiveNegotiation(
    @Param('sellOrderId', ParseIntPipe) sellOrderId: number,
    @Request() req: any,
  ) {
    const buyerId = req.user.id;

    const negotiation = await this.negotiationService.getAgreedNegotiation(
      sellOrderId,
      buyerId,
    );

    if (!negotiation) {
      return {
        success: true,
        hasActiveNegotiation: false,
        message: 'No active negotiation found',
        data: null,
      };
    }

    return {
      success: true,
      hasActiveNegotiation: true,
      message: 'Active negotiation found',
      data: {
        ...negotiation,
        timeRemaining: this.calculateTimeRemaining(negotiation.expiresAt),
        isExpired: new Date() > negotiation.expiresAt,
      },
    };
  }

  @Delete(':negotiationId/cancel')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Cancel negotiation (buyer or seller)',
    description:
      'Either buyer or seller can cancel an active negotiation. Other party gets notified.',
  })
  @ApiParam({
    name: 'negotiationId',
    description: 'ID of the negotiation to cancel',
    type: 'number',
  })
  @ApiBody({
    required: false,
    schema: {
      type: 'object',
      properties: {
        reason: {
          type: 'string',
          description: 'Optional reason for cancellation',
          example: 'Found better rate elsewhere',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Negotiation cancelled successfully',
    schema: {
      example: {
        success: true,
        message:
          'Negotiation cancelled successfully. The other party has been notified.',
        data: {
          negotiationId: 123,
          status: 'declined',
          cancelledBy: 'buyer',
          cancelledAt: '2025-09-05T15:30:45.000Z',
          reason: 'Found better rate elsewhere',
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description:
      'Cannot cancel - negotiation already completed, expired, or invalid status',
  })
  @ApiResponse({
    status: 403,
    description: 'Not authorized - user not part of this negotiation',
  })
  @ApiResponse({
    status: 404,
    description: 'Negotiation not found',
  })
  async cancelNegotiation(
    @Param('negotiationId', ParseIntPipe) negotiationId: number,
    @Body() cancelDto: { reason?: string },
    @Request() req: any,
  ) {
    const userId = req.user.userId;

    const result = await this.negotiationService.cancelNegotiation(
      negotiationId,
      userId,
      cancelDto.reason,
    );

    return {
      success: result.success,
      message: result.message,
      data: {
        negotiationId: result.negotiation.id,
        status: result.negotiation.status,
        cancelledBy: result.negotiation.buyerId === userId ? 'buyer' : 'seller',
        cancelledAt: result.negotiation.updatedAt,
        reason: cancelDto.reason || null,
        originalRate: result.negotiation.originalRate,
        proposedRate: result.negotiation.proposedRate,
      },
    };
  }

  // Helper method to calculate time remaining
  private calculateTimeRemaining(expiresAt: Date): {
    hours: number;
    minutes: number;
    totalMinutes: number;
    isExpired: boolean;
  } {
    const now = new Date();
    const expiry = new Date(expiresAt);
    const diffMs = expiry.getTime() - now.getTime();

    if (diffMs <= 0) {
      return {
        hours: 0,
        minutes: 0,
        totalMinutes: 0,
        isExpired: true,
      };
    }

    const totalMinutes = Math.floor(diffMs / (1000 * 60));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    return {
      hours,
      minutes,
      totalMinutes,
      isExpired: false,
    };
  }
}
