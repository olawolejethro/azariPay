// src/filestore/controllers/filestore.controller.ts

import {
    Controller,
    Post,
    UseInterceptors,
    UploadedFile,
    Body,
    BadRequestException,
    Get,
    Param,
    Res,
    HttpStatus,
    UseGuards,
    Request,
} from '@nestjs/common';
import { FileStoreService } from '../services/filestore.service';
import { UploadFileDto } from '../dto/upload-file.dto';
import { RetrieveFileDto } from '../dto/retrieve-file.dto';
import { GetFileMetadataDto } from '../dto/get-file-metadata.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { Response } from 'express';
import { ParseIntPipe } from '@nestjs/common';

@Controller('api/v1/filestore')
export class FileStoreController {
    constructor(private readonly fileStoreService: FileStoreService) { }

    /**
     * Uploads a file to the filestore.
     * @param file - The uploaded file.
     * @param fileMetadata - Metadata for the file.
     * @param user - The authenticated user.
     * @returns The file URL and ID.
     */
    @UseGuards(JwtAuthGuard)
    @Post()
    @UseInterceptors(FileInterceptor('file'))
    async uploadFile(
        @UploadedFile() file: Express.Multer.File,
        @Body('fileMetadata') fileMetadata: string,
        @Request() req: any,
    ) {
        const userId = req.user.userId;

        if (!file) {
            throw new BadRequestException('File is required.');
        }

        const uploadFileDto: UploadFileDto = {
            file,
            fileMetadata,
        };

        const savedFile = await this.fileStoreService.uploadFile(uploadFileDto, userId);

        return {
            data: {
                id: savedFile.id,
                fileUrl: savedFile.fileUrl,
            },
            message: 'Your file has been stored successfully.',
            errors: {},
        };
    }

    /**
     * Retrieves a file from the filestore.
     * @param fileStoreId - The ID of the file to retrieve.
     * @param res - The response object to send the file.
     */
    @UseGuards(JwtAuthGuard)
    @Get(':fileStoreId')
    async retrieveFile(
        @Param('fileStoreId', ParseIntPipe) fileStoreId: number,
        @Res() res: Response,
    ) {
        try {
            const fileStream = await this.fileStoreService.retrieveFile({ fileStoreId });

            res.setHeader('Content-Type', fileStream.ContentType);
            res.setHeader(
                'Content-Disposition',
                `attachment; filename="${this.getFileNameFromUrl(fileStream.Metadata?.filename)}"`
            );

            res.status(HttpStatus.OK);
            fileStream.Body.pipe(res);

            // Handle stream errors
            fileStream.Body.on('error', (err) => {
                console.error('Stream error:', err);
                res.status(HttpStatus.INTERNAL_SERVER_ERROR).send('Error streaming file.');
            });
        } catch (error) {
            // Optionally, handle specific errors or rethrow
            throw error;
        }
    }

    /**
     * Retrieves metadata of a stored file.
     * @param fileStoreId - The ID of the file.
     * @returns The file metadata.
     */
    @UseGuards(JwtAuthGuard)
    @Get(':fileStoreId/metadata')
    async getFileMetadata(
        @Param('fileStoreId', ParseIntPipe) fileStoreId: number,
    ) {
        const metadata = await this.fileStoreService.getFileMetadata({ fileStoreId });

        return {
            data: {
                fileMetadata: metadata,
            },
            message: 'Metadata retrieved successfully.',
            errors: {},
        };
    }

    /**
     * Extracts the filename from the URL or metadata.
     * @param filename - The filename from metadata.
     * @returns The extracted filename.
     */
    private getFileNameFromUrl(filename: string): string {
        // Implement logic to extract filename if needed
        // For example, ensure the filename is safe and properly formatted
        return filename || 'file';
    }
}
