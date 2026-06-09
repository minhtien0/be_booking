import { Module } from '@nestjs/common';
import { TypeOrmModule }    from '@nestjs/typeorm';
import { BlogsService } from './blogs.service';
import { BlogsController } from './blogs.controller';
import { Blog }         from './entities/blog.entity';
import { BlogCategory }     from './entities/blog-category.entity';
import { BlogAuthor }       from './entities/blog-author.entity';
import { BlogTag }          from './entities/blog-tag.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Blog, BlogCategory, BlogAuthor, BlogTag]),
  ],
  controllers: [BlogsController],
  providers: [BlogsService],
})
export class BlogsModule { }
