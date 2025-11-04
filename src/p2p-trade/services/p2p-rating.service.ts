import {
  Injectable,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, QueryRunner } from 'typeorm';
import { P2PRating } from '../entities/p2p-rating.entity';
import { P2PBuyer } from 'src/P2P/entities/p2p-buyer.entity';
import { P2PTrade } from '../entities/p2p-trade.entity';
import { RateUserDto } from '../dtos/rate-user.dto';
import { P2PSeller } from 'src/P2P/entities/p2p-seller.entity';
import { User } from 'src/auth/entities/user.entity';

@Injectable()
export class P2PRatingService {
  constructor(
    @InjectRepository(P2PRating)
    private readonly p2pRatingRepository: Repository<P2PRating>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(P2PBuyer)
    private readonly p2pBuyerRepository: Repository<P2PBuyer>,
    @InjectRepository(P2PSeller)
    private readonly p2pSellerRepository: Repository<P2PSeller>,
    @InjectRepository(P2PTrade)
    private readonly p2pTradeRepository: Repository<P2PTrade>,
  ) {}

  async rateUser(raterId: number, rateUserDto: RateUserDto) {
    const { ratedUserId, tradeId, rating, feedback } = rateUserDto;

    // Prevent self-rating
    if (raterId === ratedUserId) {
      throw new BadRequestException('You cannot rate yourself');
    }

    let isRatedUserBuyer = false;

    // Check if trade exists and user is part of it (if tradeId provided)
    if (tradeId) {
      const trade = await this.p2pTradeRepository.findOne({
        where: { id: tradeId },
        relations: ['buyer', 'seller'],
      });

      if (!trade) {
        throw new BadRequestException('Trade not found');
      }

      // Verify that the rater is part of this trade
      console.log(trade, ' trade details');
      const isRaterInTrade =
        trade.buyer?.id === raterId || trade.seller?.id === raterId;

      if (!isRaterInTrade) {
        throw new ForbiddenException(
          'You can only rate users from your own trades',
        );
      }

      // IMPORTANT: Set isRatedUserBuyer based on the rated user's role
      isRatedUserBuyer = trade.buyer?.id === ratedUserId;

      // Verify that the rated user is the other party in the trade
      const expectedRatedUserId =
        trade.buyer?.id === raterId ? trade.seller?.id : trade.buyer.id;

      if (ratedUserId !== expectedRatedUserId) {
        throw new BadRequestException(
          'You can only rate the other party in this trade',
        );
      }

      // Check if rating already exists for this trade
      const existingRating = await this.p2pRatingRepository.findOne({
        where: {
          raterId,
          ratedUserId,
          tradeId,
        },
      });

      if (existingRating) {
        throw new BadRequestException(
          'You have already rated this user for this trade',
        );
      }
    }

    // Create the rating
    const p2pRating = this.p2pRatingRepository.create({
      raterId,
      ratedUserId,
      tradeId,
      rating,
      feedback,
    });

    await this.p2pRatingRepository.save(p2pRating);

    // Update the rated user's average rating
    // Update rating based on their role in the trade
    if (tradeId) {
      await this.updateUserAverageRating(ratedUserId, isRatedUserBuyer);
    } else {
      // If no tradeId, update both buyer and seller ratings
      await this.updateUserAverageRating(ratedUserId);
    }

    return {
      data: {
        id: p2pRating.id,
        rating: p2pRating.rating,
        feedback: p2pRating.feedback,
        createdAt: p2pRating.createdAt,
      },
      message: 'User rated successfully',
      errors: {},
    };
  }

  private async updateUserAverageRating(userId: number, isBuyer?: boolean) {
    // Calculate average rating
    const result = await this.p2pRatingRepository
      .createQueryBuilder('rating')
      .select('AVG(rating.rating)', 'averageRating')
      .where('rating.ratedUserId = :userId', { userId })
      .getRawOne();

    const averageRating = parseFloat(result.averageRating) || 0;
    const roundedRating = Math.round(averageRating * 10) / 10;

    // Update user's overall rating
    await this.userRepository.update(
      { id: userId },
      {
        rating: roundedRating,
      },
    );

    // Update based on role
    // if (isBuyer === true) {
    //   // Only update buyer rating
    //   await this.p2pBuyerRepository.update(
    //     { userId },
    //     { rating: roundedRating },
    //   );
    // } else if (isBuyer === false) {
    //   // Only update seller rating
    //   await this.p2pSellerRepository.update(
    //     { userId },
    //     { rating: roundedRating },
    //   );
    // } else {
    //   // Update both if role is unknown
    //   await this.p2pBuyerRepository.update(
    //     { userId },
    //     { rating: roundedRating },
    //   );
    //   await this.p2pSellerRepository.update(
    //     { userId },
    //     { rating: roundedRating },
    //   );
    // }
  }
  async getUserRatings(userId: number, page: number = 1, limit: number = 10) {
    // Convert to numbers and validate
    const pageNum = Number(page) || 1;
    const limitNum = Number(limit) || 10;

    // Ensure positive values
    const validPage = Math.max(1, pageNum);
    const validLimit = Math.min(Math.max(1, limitNum), 100); // Cap at 100 items per page

    const [ratings, total] = await this.p2pRatingRepository.findAndCount({
      where: { ratedUserId: userId },
      relations: ['rater'],
      order: { createdAt: 'DESC' },
      skip: (validPage - 1) * validLimit,
      take: validLimit,
    });

    return {
      data: {
        ratings: ratings.map((rating) => ({
          id: rating.id,
          rating: rating.rating,
          feedback: rating.feedback,
          raterName: rating.rater.firstName + ' ' + rating.rater.lastName,
          createdAt: rating.createdAt,
        })),
        pagination: {
          total,
          page: validPage,
          limit: validLimit,
          totalPages: Math.ceil(total / validLimit),
        },
      },
      message: 'User ratings retrieved successfully',
      errors: {},
    };
  }
}
