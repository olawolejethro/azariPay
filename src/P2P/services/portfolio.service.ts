// src/P2P/services/portfolio.service.ts
import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Portfolio } from '../entities/porfolio.entity';
import { CreatePortfolioDto } from '../dtos/portfolio.dto';
import { UpdatePortfolioDto } from '../dtos/update-portfolio.dto';
import { User } from 'src/auth/entities/user.entity';

@Injectable()
export class PortfolioService {
  constructor(
    @InjectRepository(Portfolio)
    private portfolioRepository: Repository<Portfolio>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  async create(
    userId: number,
    createPortfolioDto: CreatePortfolioDto,
  ): Promise<Portfolio> {
    // Check if user exists
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    // Check if portfolio for this currency already exists for the user
    const existingPortfolio = await this.portfolioRepository.findOne({
      where: {
        userId,
        currency: createPortfolioDto.currency,
      },
    });

    if (existingPortfolio) {
      throw new BadRequestException(
        `Portfolio for ${createPortfolioDto.currency} already exists`,
      );
    }

    // Validate payment information based on currency
    if (createPortfolioDto.currency === 'NGN') {
      if (!createPortfolioDto.bankName || !createPortfolioDto.accountNumber) {
        throw new BadRequestException(
          'Bank name, account number, and account name are required for NGN portfolios',
        );
      }
    } else if (createPortfolioDto.currency === 'CAD') {
      if (!createPortfolioDto.interacEmail) {
        throw new BadRequestException(
          'Interac email is required for CAD portfolios',
        );
      }
    }

    // Create new portfolio
    const portfolio = this.portfolioRepository.create({
      ...createPortfolioDto,
      userId,
    });

    return this.portfolioRepository.save(portfolio);
  }

  async findAll(userId: number): Promise<Portfolio[]> {
    return this.portfolioRepository.find({
      where: { userId },
    });
  }

  async findOne(userId: number, id: number): Promise<Portfolio> {
    const portfolio = await this.portfolioRepository.findOne({
      where: { id, userId },
    });

    if (!portfolio) {
      throw new NotFoundException(`Portfolio with ID ${id} not found`);
    }

    return portfolio;
  }

  async update(
    userId: number,
    id: number,
    updatePortfolioDto: UpdatePortfolioDto,
  ): Promise<Portfolio> {
    const portfolio = await this.findOne(userId, id);

    // Validate payment information based on currency if changed
    if (updatePortfolioDto.currency) {
      if (updatePortfolioDto.currency === 'NGN') {
        const hasBankInfo =
          (portfolio.bankName || updatePortfolioDto.bankName) &&
          (portfolio.accountNumber || updatePortfolioDto.accountNumber) &&
          (portfolio.accountName || updatePortfolioDto.accountName);

        if (!hasBankInfo) {
          throw new BadRequestException(
            'Bank name, account number, and account name are required for NGN portfolios',
          );
        }
      } else if (updatePortfolioDto.currency === 'CAD') {
        if (!portfolio.interacEmail && !updatePortfolioDto.interacEmail) {
          throw new BadRequestException(
            'Interac email is required for CAD portfolios',
          );
        }
      }
    }

    // Update portfolio
    this.portfolioRepository.merge(portfolio, updatePortfolioDto);
    return this.portfolioRepository.save(portfolio);
  }

  async remove(userId: number, id: number): Promise<void> {
    const portfolio = await this.findOne(userId, id);
    await this.portfolioRepository.remove(portfolio);
  }
}
