// src/p2p-chat/controllers/p2p-chat.controller.ts
import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  ParseUUIDPipe,
  BadRequestException,
  UploadedFile,
  UseInterceptors,
  ParseIntPipe,
} from '@nestjs/common';

import {
  CreateMessageDto,
  UpdateTradeStatusDto,
  PaginationQueryDto,
} from '../../dtos/p2p-chat.dto/p2p-chat.dto';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { P2PChatService } from 'src/p2p-chat/services/p2p-chat/p2p-chat.service';
import { FileInterceptor } from '@nestjs/platform-express';

@ApiTags('p2p-chat')
@Controller('api/v1/p2p-chat')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class P2PChatController {
  constructor(private readonly p2pChatService: P2PChatService) {}

  @Get(':tradeId')
  @ApiOperation({ summary: 'Get trade details' })
  @ApiParam({ name: 'tradeId', description: 'Trade ID', type: 'string' })
  @ApiResponse({ status: 200, description: 'Returns trade details' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - User is not a participant',
  })
  @ApiResponse({ status: 404, description: 'Trade not found' })
  async getTrade(
    @Param('tradeId', new ParseUUIDPipe()) tradeId: number,
    @Request() req,
  ) {
    return await this.p2pChatService.getTrade(tradeId, req.user.id);
  }

  @Get(':tradeId/messages')
  @ApiOperation({ summary: 'Get chat messages for a trade' })
  @ApiParam({ name: 'tradeId', description: 'Trade ID', type: 'string' })
  @ApiQuery({ type: PaginationQueryDto })
  @ApiResponse({ status: 200, description: 'Returns paginated messages' })
  async getMessages(
    @Param('tradeId') tradeId: number,
    @Query() paginationQuery: PaginationQueryDto,
    @Request() req,
  ) {
    return await this.p2pChatService.getMessages(
      tradeId,
      req.user.userId,
      paginationQuery,
    );
  }

  @Post(':tradeId/messages/:otherUserId')
  @ApiOperation({ summary: 'Send a message in a trade chat' })
  @ApiParam({ name: 'tradeId', description: 'Trade ID', type: 'string' })
  @ApiResponse({ status: 201, description: 'Message sent successfully' })
  async createMessage(
    @Param('tradeId') tradeId: number,
    @Param('otherUserId') otherUserId: number,
    @Body() createMessageDto: CreateMessageDto,
    @Request() req,
  ) {
    return await this.p2pChatService.createMessage(
      otherUserId,
      tradeId,
      req.user.userId,
      createMessageDto,
    );
  }

  @Post(':tradeId/upload')
  @ApiOperation({ summary: 'Upload image or document for trade chat' })
  @ApiParam({ name: 'tradeId', description: 'Trade ID', type: 'number' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'File upload',
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description:
            'Image (jpg, png, gif) or Document (pdf, doc, docx) - Max 10MB',
        },
        fileType: {
          type: 'string',
          enum: ['image', 'document'],
          description: 'Type of file being uploaded',
        },
        fileMetadata: {
          type: 'string',
          description: 'JSON string containing metadata for the file',
          example:
            '{"description":"Payment receipt","purpose":"trade_evidence"}',
        },
      },
      required: ['file', 'fileType', 'fileMetadata'],
    },
  })
  @ApiResponse({
    status: 201,
    description: 'File uploaded successfully',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'number', example: 123 },
        fileUrl: {
          type: 'string',
          example: 'https://bucket.s3.region.wasabisys.com/uuid.jpg',
        },
        fileMetadata: {
          type: 'object',
          example: {
            fileType: 'image',
            originalName: 'payment-receipt.jpg',
            fileSize: 245760,
            mimeType: 'image/jpeg',
            tradeId: 123,
            uploadedFor: 'trade_evidence',
          },
        },
        userId: { type: 'number', example: 456 },
        createdAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid file type or size' })
  @ApiResponse({
    status: 403,
    description: 'User not authorized for this trade',
  })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
      },
      fileFilter: (req, file, callback) => {
        // Allowed file types
        const allowedMimes = [
          // Images
          'image/jpeg',
          'image/jpg',
          'image/png',
          'image/gif',
          'image/webp',
          // Documents
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ];

        if (!allowedMimes.includes(file.mimetype)) {
          return callback(
            new BadRequestException(
              'Invalid file type. Only images (jpg, png, gif, webp) and documents (pdf, doc, docx, xls, xlsx) are allowed',
            ),
            false,
          );
        }
        callback(null, true);
      },
    }),
  )
  async uploadFile(
    @Param('tradeId') tradeId: number,
    @UploadedFile() file: Express.Multer.File,
    @Body('fileType') fileType: 'image' | 'document',
    @Body('fileMetadata') fileMetadata: string,
    @Request() req,
  ) {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    // Verify user has access to this trade
    await this.p2pChatService.getTrade(tradeId, req.user.userId);

    // Upload file using the file store service
    const uploadResult = await this.p2pChatService.uploadTradeFile(
      tradeId,
      file,
      fileType,
      fileMetadata,
      req.user.userId,
    );

    return uploadResult;
  }

  // Add to P2PChatController or create NegotiationChatController
  @Get('negotiation/:negotiationId/messages')
  @ApiOperation({ summary: 'Get chat messages for a negotiation' })
  @ApiParam({
    name: 'negotiationId',
    description: 'Negotiation ID',
    type: 'number',
  })
  async getNegotiationMessages(
    @Param('negotiationId', ParseIntPipe) negotiationId: number,
    @Query() paginationQuery: PaginationQueryDto,
    @Request() req: any,
  ) {
    return await this.p2pChatService.getNegotiationMessages(
      negotiationId,
      req.user.userId,
      paginationQuery,
    );
  }

  @Post('negotiation/:negotiationId/messages/:otherUserId')
  @ApiOperation({ summary: 'Send a message in negotiation chat' })
  @ApiParam({
    name: 'negotiationId',
    description: 'Negotiation ID',
    type: 'number',
  })
  @ApiParam({
    name: 'otherUserId',
    description: 'Other user ID',
    type: 'number',
  })
  async createNegotiationMessage(
    @Param('negotiationId', ParseIntPipe) negotiationId: number,
    @Param('otherUserId', ParseIntPipe) otherUserId: number,
    @Body() createMessageDto: CreateMessageDto,
    @Request() req: any,
  ) {
    return await this.p2pChatService.createNegotiationMessage(
      negotiationId,
      otherUserId,
      req.user.userId,
      createMessageDto,
    );
  }

  @Put(':tradeId/status')
  @ApiOperation({ summary: 'Update trade status' })
  @ApiParam({ name: 'tradeId', description: 'Trade ID', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Trade status updated successfully',
  })
  @ApiResponse({ status: 403, description: 'Forbidden - Cannot change status' })
  async updateTradeStatus(
    @Param('tradeId') tradeId: number,
    @Body() updateStatusDto: UpdateTradeStatusDto,
    @Request() req,
  ) {
    return await this.p2pChatService.updateTradeStatus(
      tradeId,
      req.user.userId,
      updateStatusDto,
    );
  }

  @Put(':tradeId/messages/:messageId/read')
  @ApiOperation({ summary: 'Mark a message as read' })
  @ApiParam({ name: 'tradeId', description: 'Trade ID', type: 'string' })
  @ApiParam({ name: 'messageId', description: 'Message ID', type: 'string' })
  @ApiResponse({ status: 200, description: 'Message marked as read' })
  async markMessageAsRead(
    @Param('tradeId') tradeId: number,
    @Param('messageId') messageId: number,
    @Request() req,
  ) {
    await this.p2pChatService.markMessageAsRead(
      tradeId,
      messageId,
      req.user.userId,
    );
    return { success: true };
  }

  //   @Put(':tradeId/messages/read-all')
  //   @ApiOperation({ summary: 'Mark all messages as read' })
  //   @ApiParam({ name: 'tradeId', description: 'Trade ID

  @Put(':tradeId/messages/read-all')
  @ApiOperation({ summary: 'Mark all messages as read' })
  @ApiParam({ name: 'tradeId', description: 'Trade ID', type: 'string' })
  @ApiResponse({ status: 200, description: 'All messages marked as read' })
  async markAllMessagesAsRead(
    @Param('tradeId') tradeId: number,
    @Request() req,
  ) {
    await this.p2pChatService.markAllMessagesAsRead(tradeId, req.user.userId);
    return { success: true };
  }
}
