import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { FeeManagementService } from '../services/fee-management.service';
import { CreateFeeDto, UpdateFeeDto } from '../dtos/fee-management.dto';

@Controller('api/v1/fee-management')
@ApiTags('Fee Management')
@ApiBearerAuth()
// @UseGuards(JwtAuthGuard)
export class FeeManagementController {
  constructor(private readonly feeManagementService: FeeManagementService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new fee configuration' })
  @ApiResponse({
    status: 201,
    description: 'Fee configuration created successfully',
  })
  async createFeeConfiguration(@Body() createFeeDto: CreateFeeDto) {
    return await this.feeManagementService.createFeeConfiguration(createFeeDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all fee configurations' })
  @ApiResponse({ status: 200, description: 'List of all fee configurations' })
  async getAllFeeConfigurations(
    @Query('transaction_type') transactionType?: string,
    @Query('currency') currency?: string,
    @Query('is_active') isActive?: boolean,
  ) {
    return await this.feeManagementService.getAllFeeConfigurations({
      transactionType,
      currency,
      isActive,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get fee configuration by ID' })
  @ApiResponse({ status: 200, description: 'Fee configuration found' })
  @ApiResponse({ status: 404, description: 'Fee configuration not found' })
  async getFeeConfigurationById(@Param('id') id: number) {
    return await this.feeManagementService.getFeeConfigurationById(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update fee configuration' })
  @ApiResponse({
    status: 200,
    description: 'Fee configuration updated successfully',
  })
  @ApiResponse({ status: 404, description: 'Fee configuration not found' })
  async updateFeeConfiguration(
    @Param('id') id: number,
    @Body() updateFeeDto: UpdateFeeDto,
  ) {
    return await this.feeManagementService.updateFeeConfiguration(
      id,
      updateFeeDto,
    );
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete fee configuration' })
  @ApiResponse({
    status: 200,
    description: 'Fee configuration deleted successfully',
  })
  @ApiResponse({ status: 404, description: 'Fee configuration not found' })
  async deleteFeeConfiguration(@Param('id') id: number) {
    return await this.feeManagementService.deleteFeeConfiguration(id);
  }

  @Get('transaction/:type')
  @ApiOperation({ summary: 'Get fee for specific transaction type' })
  @ApiResponse({ status: 200, description: 'Fee amount for transaction type' })
  async getFeeForTransactionType(
    @Param('type') transactionType: string,
    @Query('currency') currency: string = 'NGN',
  ) {
    return await this.feeManagementService.getFeeForTransactionType(
      transactionType,
      currency,
    );
  }
}
