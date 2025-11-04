import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { P2PRatingService } from '../services/p2p-rating.service';
import { RateUserDto } from '../dtos/rate-user.dto';

@ApiTags('P2P Rating')
@Controller('api/v1/p2p-rating')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class P2PRatingController {
  constructor(private readonly p2pRatingService: P2PRatingService) {}

  @Post()
  @ApiOperation({ summary: 'Rate a user after P2P trade' })
  @ApiResponse({
    status: 201,
    description: 'User rated successfully',
    schema: {
      example: {
        data: {
          id: 1,
          rating: 5,
          feedback: 'Great trader!',
          createdAt: '2024-01-01T00:00:00.000Z',
        },
        message: 'User rated successfully',
        errors: {},
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - Invalid rating or already rated',
  })
  async rateUser(@Body() rateUserDto: RateUserDto, @Request() req) {
    const raterId = req.user.userId;
    return this.p2pRatingService.rateUser(raterId, rateUserDto);
  }

  @Get('user/ratings/:userId')
  @ApiOperation({ summary: 'Get ratings for a specific user' })
  @ApiResponse({
    status: 200,
    description: 'User ratings retrieved successfully',
  })
  async getUserRatings(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Param('userId') userId: number,
    @Request() req,
  ) {
    // const userId = req.user.userId;
    return this.p2pRatingService.getUserRatings(userId, page, limit);
  }
}
