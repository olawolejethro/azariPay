import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  Request,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { SubmitReportDto } from '../dtos/reportTransaction.dto';
import { ReportsService } from '../services/reportTransaction.service';

@Controller('api/v1/reports')
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Post('submit')
  @UseInterceptors(
    FileInterceptor('uploadReceipt', {
      //   fileFilter: (req, file, callback) => {
      //     if (!file.originalname.match(/\.(jpg|jpeg|png|pdf|doc|docx)$/)) {
      //       return callback(
      //         new Error('Only image and document files are allowed!'),
      //         false,
      //       );
      //     }
      //     callback(null, true);
      //   },
      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
      },
    }),
  )
  async submitReport(
    @Request() req,
    @Body() submitReportDto: SubmitReportDto,
    @UploadedFile() uploadReceipt?: Express.Multer.File,
  ) {
    return this.reportsService.submitReport(
      req.user.userId,
      submitReportDto,
      uploadReceipt,
    );
  }

  @Get('my-reports')
  async getMyReports(@Request() req, @Query() query: any) {
    return this.reportsService.getUserReports(req.user.id, query);
  }

  @Get(':id')
  async getReport(@Request() req, @Param('id') id: number) {
    return this.reportsService.getReportById(req.user.id, id);
  }

  @Put(':id/cancel')
  async cancelReport(@Request() req, @Param('id') id: number) {
    return this.reportsService.cancelReport(req.user.id, id);
  }
}
