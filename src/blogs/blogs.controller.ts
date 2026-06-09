import { Controller, Get, Query, Post, Body, Patch, Param, Delete, HttpCode, HttpStatus } from '@nestjs/common';
import { BlogsService } from './blogs.service';
import { CreateBlogDto } from './dto/create-blog.dto';
import { UpdateBlogDto } from './dto/update-blog.dto';
import { CreateBlogPostDto } from './dto/create-blog-post.dto';

@Controller('blogs')
export class BlogsController {
  constructor(private readonly blogsService: BlogsService) { }

  @Get('view-list')
  async getViewList(
    @Query('page') page?: string,
    @Query('category') categorySlug?: string,
    @Query('tag') tagSlug?: string,
    @Query('search') search?: string,
  ) {
    const limit = 6;
    const currentPage = Math.max(1, parseInt(page || '1', 10));

    return this.blogsService.findPublishedBlogs({
      page: currentPage,
      limit,
      categorySlug,
      tagSlug,
      search,
    });
  }

  @Get('list-blog-section')
  async getListBlogSection() {
    return this.blogsService.listBlogSection();
  }

  @Get('sidebar-metadata')
  async getSidebarData() {
    return this.blogsService.getSidebarMetadata();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() createBlogPostDto: CreateBlogPostDto) {
    return this.blogsService.create(createBlogPostDto);
  }

  @Get('detail/:slug')
  async getBySlug(@Param('slug') slug: string) {
    return this.blogsService.getBySlug(slug);
  }
  @Get()
  findAll() {
    return this.blogsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.blogsService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateBlogDto: UpdateBlogDto) {
    return this.blogsService.update(+id, updateBlogDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.blogsService.remove(+id);
  }
}
