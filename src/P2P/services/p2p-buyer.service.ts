// src/P2P/services/p2p-buyer.service.ts
import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { P2PBuyer } from '../entities/p2p-buyer.entity';
import { CreateP2PBuyerDto } from '../dtos/create-p2p-buyer.dto';
import {
  UpdateP2PBuyerDto,
  P2POrderStatus,
} from '../dtos/update-p2p-buyer.dto';
import { User } from 'src/auth/entities/user.entity';
import { CADWalletEntity } from 'src/wallets/entities/CADwallet.entity';
import { NGNWalletEntity } from 'src/wallets/entities/NGNwallet.entity';

@Injectable()
export class P2PBuyerService {
  constructor(
    @InjectRepository(P2PBuyer)
    private p2pBuyerRepository: Repository<P2PBuyer>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(CADWalletEntity)
    private cadWalletRepo: Repository<CADWalletEntity>,
    @InjectRepository(NGNWalletEntity)
    private ngnWalletRepo: Repository<NGNWalletEntity>,
  ) {}

  async create(
    userId: number,
    createP2PBuyerDto: CreateP2PBuyerDto,
  ): Promise<P2PBuyer> {
    // Check if user exists
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    // Check onboarding/KYC status
    const onboardingCompleted =
      user.pin !== null && user.kycStatus === 'SUCCESS';

    if (!onboardingCompleted) {
      throw new BadRequestException(
        'Onboarding not completed. Please complete KYC before creating an order.',
      );
    }

    const cadWallet = await this.cadWalletRepo.findOne({
      where: { userId },
    });

    if (!cadWallet) {
      throw new NotFoundException(
        `CAD wallet for user with ID ${userId} not found`,
      );
    }

    const ngnWallet = await this.ngnWalletRepo.findOne({
      where: { userId },
    });
    if (!ngnWallet) {
      throw new NotFoundException(
        `NGN wallet for user with ID ${userId} not found`,
      );
    }
    // Validate the currency pair
    // if (createP2PBuyerDto.sellCurrency === 'CAD') {
    //   if (createP2PBuyerDto.availableAmount > cadWallet.balance) {
    //     throw new BadRequestException(
    //       `Available amount exceeds CAD wallet balance for this user}`,
    //     );
    //   }
    // }

    // if (createP2PBuyerDto.sellCurrency === 'NGN') {
    //   if (createP2PBuyerDto.availableAmount > ngnWallet.balance) {
    //     throw new BadRequestException(
    //       `Available amount exceeds NGN wallet balance for user with ID ${userId}`,
    //     );
    //   }
    // }
    // Validate that the user has sufficient balance in the wallet for the transaction
    // Validate the currency pair
    if (createP2PBuyerDto.buyCurrency === createP2PBuyerDto.sellCurrency) {
      throw new BadRequestException(
        'Buy currency and sell currency cannot be the same',
      );
    }

    // Ensure minimum transaction limit is valid
    if (
      createP2PBuyerDto.minTransactionLimit > createP2PBuyerDto.availableAmount
    ) {
      throw new BadRequestException(
        'Minimum transaction limit cannot exceed available amount',
      );
    }

    // Create new P2P buyer order
    const buyerOrder = this.p2pBuyerRepository.create({
      ...createP2PBuyerDto,
      userId,
      status: P2POrderStatus.PENDING,
    });

    // Save and return the new order
    const savedOrder = await this.p2pBuyerRepository.save(buyerOrder);

    // In a real-world scenario, you might want to trigger a matching algorithm here
    // to find potential sellers for this buyer

    return savedOrder;
  }

  async findAll(
    userId?: number,
    buyCurrency?: string,
    sellCurrency?: string,
    rating?: number,
    exchangeRate?: number,
    completionTime?: number,
    sortBy: string = 'createdAt',
    sortOrder: 'ASC' | 'DESC' = 'DESC',
    search?: string,
    skip: number = 0,
    limit: number = 10,
  ): Promise<{ data: P2PBuyer[]; total: number }> {
    // Build query for buy orders
    const queryBuilder = this.p2pBuyerRepository
      .createQueryBuilder('buyer')
      .leftJoinAndSelect('buyer.user', 'user')
      .select(['buyer', 'user.firstName', 'user.lastName']);

    // Add join if we need to filter or sort by user fields
    // if (rating !== undefined || sortBy === 'rating') {
    //   queryBuilder.leftJoinAndSelect('buyer.user', 'user');
    // }

    if (search) {
      queryBuilder.andWhere(
        `(
      LOWER(user.firstName) LIKE :search OR
      LOWER(user.lastName) LIKE :search OR
      LOWER(buyer.bankName) LIKE :search OR
      CAST(buyer.exchangeRate AS TEXT) LIKE :search OR
      CAST(buyer.minTransactionLimit AS TEXT) LIKE :search
    )`,
        { search: `%${search.toLowerCase()}%` },
      );
    }

    // Exclude the current user's orders
    if (userId !== undefined) {
      queryBuilder.andWhere('buyer.userId != :userId', { userId });
    }

    if (rating !== undefined) {
      queryBuilder.andWhere('buyer.rating = :rating', { rating });
    }

    if (buyCurrency) {
      queryBuilder.andWhere('buyer.buyCurrency = :buyCurrency', {
        buyCurrency,
      });
    }

    if (sellCurrency) {
      queryBuilder.andWhere('buyer.sellCurrency = :sellCurrency', {
        sellCurrency,
      });
    }

    // // Add exchange rate filter if provided
    if (exchangeRate !== undefined) {
      queryBuilder.andWhere('buyer.exchangeRate = :exchangeRate', {
        exchangeRate,
      });
    }

    // // Add completion time filter if provided
    if (completionTime !== undefined) {
      queryBuilder.andWhere('buyer.transactionDuration = :completionTime', {
        completionTime,
      });
    }

    // if (completionTime !== undefined && !isNaN(completionTime)) {
    //   queryBuilder.andWhere('buyer.transactionDuration = :completionTime', {
    //     completionTime
    //   });
    // }
    // Determine sorting field
    let orderByField = 'buyer.createdAt';
    switch (sortBy) {
      case 'exchangeRate':
        orderByField = 'buyer.exchangeRate';
        break;
      case 'completionTime':
        orderByField = 'buyer.transactionDuration';
        break;
      case 'rating':
        orderByField = 'user.rating'; // Rating is on the user entity
        break;
      case 'createdAt':
      default:
        orderByField = 'buyer.createdAt';
        break;
    }

    // Apply sorting
    queryBuilder.orderBy(orderByField, sortOrder);
    queryBuilder.skip(skip).take(limit);
    const [data, total] = await queryBuilder.getManyAndCount();

    return { data, total };
  }

  async findOne(userId: number, id: number): Promise<P2PBuyer> {
    const buyerOrder = await this.p2pBuyerRepository.findOne({
      where: { id, userId },
    });

    if (!buyerOrder) {
      throw new NotFoundException(`P2P buy order with ID ${id} not found`);
    }

    return buyerOrder;
  }

  async update(
    userId: number,
    id: number,
    updateP2PBuyerDto: UpdateP2PBuyerDto,
  ): Promise<P2PBuyer> {
    const buyerOrder = await this.findOne(userId, id);

    // Check if order can be updated
    if (buyerOrder.status !== P2POrderStatus.PENDING) {
      throw new BadRequestException(
        `Cannot update a buy order with status: ${buyerOrder.status}`,
      );
    }

    // Validate currency pair if changed
    if (
      updateP2PBuyerDto.buyCurrency &&
      updateP2PBuyerDto.sellCurrency &&
      updateP2PBuyerDto.buyCurrency === updateP2PBuyerDto.sellCurrency
    ) {
      throw new BadRequestException(
        'Buy currency and sell currency cannot be the same',
      );
    }

    // Ensure minimum transaction limit is valid if changed
    if (
      (updateP2PBuyerDto.minTransactionLimit ||
        buyerOrder.minTransactionLimit) >
      (updateP2PBuyerDto.availableAmount || buyerOrder.availableAmount)
    ) {
      throw new BadRequestException(
        'Minimum transaction limit cannot exceed available amount',
      );
    }

    // Update the order
    this.p2pBuyerRepository.merge(buyerOrder, updateP2PBuyerDto);
    return this.p2pBuyerRepository.save(buyerOrder);
  }

  async cancel(userId: number, id: number): Promise<P2PBuyer> {
    const buyerOrder = await this.findOne(userId, id);

    // Check if order can be cancelled
    if (buyerOrder.status !== P2POrderStatus.PENDING) {
      throw new BadRequestException(
        `Cannot cancel a buy order with status: ${buyerOrder.status}`,
      );
    }

    // Update status to cancelled
    buyerOrder.status = P2POrderStatus.CANCELLED;
    buyerOrder.isActive = false;

    return this.p2pBuyerRepository.save(buyerOrder);
  }

  async calculateConversionForBuyer(
    buyerId: number,
    amount: number, // Amount seller is offering (seller's currency)
    fromCurrency: string, // Seller's currency (what they're offering)
    toCurrency: string, // Buyer's currency (what they want to pay with)
  ) {
    // Find the buyer
    const buyer = await this.p2pBuyerRepository.findOne({
      where: { id: buyerId, isActive: true },
    });

    if (!buyer) {
      throw new NotFoundException(
        `Buyer with ID ${buyerId} not found or inactive`,
      );
    }

    // Determine currencies from buyer's order
    const buyerWantsCurrency = fromCurrency; // What buyer wants to receive (what seller is offering)
    const buyerHasCurrency = toCurrency; // What buyer is willing to pay with

    // Use buyer's currencies - Fixed the logic
    const actualFromCurrency = fromCurrency; // What seller is offering (what buyer wants)
    const actualToCurrency = toCurrency; // What buyer will pay with

    // Validate currencies match what the buyer is looking for
    if (
      (actualFromCurrency !== buyerWantsCurrency &&
        actualFromCurrency !== buyerHasCurrency) ||
      (actualToCurrency !== buyerWantsCurrency &&
        actualToCurrency !== buyerHasCurrency)
    ) {
      throw new BadRequestException(
        `Buyer doesn't support conversion between ${actualFromCurrency} and ${actualToCurrency}`,
      );
    }

    // console.log(
    //   actualFromCurrency,
    //   actualToCurrency,
    //   'buyerWantsCurrency, buyerHasCurrency',
    // );

    // // Check if amount is within transaction limits
    // // Need to convert the seller's offer to buyer's currency for proper comparison
    // if (actualFromCurrency === 'CAD' && actualToCurrency === 'NGN') {
    //   // Seller offering CAD, buyer will pay NGN
    //   // Convert CAD amount to NGN equivalent for limit checking

    //   const convertedToCAD = amount / buyer.exchangeRate;
    //   const convertedToNGN = amount * buyer.exchangeRate;

    //   if (amount < buyer.minTransactionLimit) {
    //     throw new BadRequestException(
    //       `Amount is below minimum transaction limit of ${buyer.minTransactionLimit} CAD (equivalent to ${convertedToNGN} NGN)`,
    //     );
    //   }
    //   if (amount > buyer.availableAmount) {
    //     throw new BadRequestException(
    //       `Amount exceeds buyer's available amount of ${buyer.availableAmount} CAD (equivalent to ${convertedToNGN} NGN)`,
    //     );
    //   }
    // } else if (actualFromCurrency === 'NGN' && actualToCurrency === 'CAD') {
    //   // Seller offering NGN, buyer will pay CAD
    //   // Convert NGN amount to CAD equivalent for limit checking
    //   const convertedToNGN = amount * buyer.exchangeRate;
    //   const convertedToCAD = amount / buyer.exchangeRate;

    //   if (amount < buyer.minTransactionLimit) {
    //     throw new BadRequestException(
    //       `Amount is below minimum transaction limit of ${buyer.minTransactionLimit} NGN (equivalent to ${convertedToCAD} CAD)`,
    //     );
    //   }
    //   if (amount > buyer.availableAmount) {
    //     throw new BadRequestException(
    //       `Amount exceeds buyer's available amount of ${buyer.availableAmount} NGN (equivalent to ${convertedToCAD} CAD)`,
    //     );
    //   }
    // } else {
    //   throw new BadRequestException(
    //     `Unsupported currency conversion: ${actualFromCurrency} to ${actualToCurrency}`,
    //   );
    // }

    // Calculate conversion using buyer's exchange rate
    let convertedAmount: number;
    let fee = 0; // Fee can be added here if needed

    // Scenario 1: Seller offers CAD, Buyer pays with NGN (CAD → NGN payment)
    if (actualFromCurrency === 'CAD' && actualToCurrency === 'NGN') {
      // CAD to NGN: multiply (e.g., 100 CAD × 1200 = 120,000 NGN buyer pays)
      convertedAmount = amount * buyer.exchangeRate;
      convertedAmount = Math.round(convertedAmount * 100) / 100;
    }
    // Scenario 2: Seller offers NGN, Buyer pays with CAD (NGN → CAD payment)
    else if (actualFromCurrency === 'NGN' && actualToCurrency === 'CAD') {
      // NGN to CAD: divide (e.g., 120,000 NGN ÷ 1200 = 100 CAD buyer pays)
      convertedAmount = amount / buyer.exchangeRate;
      convertedAmount = Math.round(convertedAmount * 100) / 100;

      // console.log(convertedAmount, 'convertedAmount for buyer payment');
    } else {
      throw new BadRequestException(
        `Buyer doesn't support conversion between ${actualFromCurrency} and ${actualToCurrency}`,
      );
    }

    // Apply any fees
    const finalAmount = convertedAmount + fee; // Add fee to what buyer pays

    return {
      success: true,
      data: {
        buyerId: buyer.id,
        inputAmount: amount, // What seller is offering
        inputCurrency: actualFromCurrency, // Seller's currency
        outputAmount: finalAmount, // What buyer will pay
        outputCurrency: actualToCurrency, // Buyer's payment currency
        exchangeRate: buyer.exchangeRate,
        fee: fee,
        transactionDuration: buyer.transactionDuration,
        minTransactionLimit: buyer.minTransactionLimit,
        buyerWalletBalance:
          actualToCurrency === 'NGN'
            ? (
                await this.ngnWalletRepo.findOne({
                  where: { userId: buyer.userId },
                })
              )?.balance || 0
            : (
                await this.cadWalletRepo.findOne({
                  where: { userId: buyer.userId },
                })
              )?.balance || 0,
      },
    };
  }
}
