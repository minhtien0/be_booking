import { Injectable, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { CreateBlogDto } from './dto/create-blog.dto';
import { UpdateBlogDto } from './dto/update-blog.dto';
import { Blog, PostStatus, ContentBlock } from './entities/blog.entity';
import { BlogCategory } from './entities/blog-category.entity';
import { BlogAuthor } from './entities/blog-author.entity';
import { BlogTag } from './entities/blog-tag.entity';
import { CreateBlogPostDto } from './dto/create-blog-post.dto';
import { BlogPostResponseDto } from './dto/blog-post-response.dto';
import { BlogCategoriesResponseDto } from './dto/blog-categories-response.dto';

@Injectable()
export class BlogsService {
  constructor(
    @InjectRepository(Blog) private postRepo: Repository<Blog>,
    @InjectRepository(BlogCategory) private categoryRepo: Repository<BlogCategory>,
    @InjectRepository(BlogAuthor) private authorRepo: Repository<BlogAuthor>,
    @InjectRepository(BlogTag) private tagRepo: Repository<BlogTag>,
  ) { }

  async findPublishedBlogs(query: {
    page: number;
    limit: number;
    categorySlug?: string;
    tagSlug?: string;
    search?: string;
  }) {
    const { page, limit, categorySlug, tagSlug, search } = query;
    const skip = (page - 1) * limit;

    // Khởi tạo Query Builder để xử lý tốt các mối quan hệ nhiều-nhiều phức tạp (Tags)
    const queryBuilder = this.postRepo
      .createQueryBuilder('blog')
      .leftJoinAndSelect('blog.category', 'category')
      .leftJoinAndSelect('blog.tags', 'tag')
      .where('blog.status = :status', { status: PostStatus.PUBLISHED });

    // Lọc theo Category Slug
    if (categorySlug) {
      queryBuilder.andWhere('category.slug = :categorySlug', { categorySlug });
    }

    // Lọc theo Tag Slug
    if (tagSlug) {
      queryBuilder.andWhere('tag.slug = :tagSlug', { tagSlug });
    }

    // Tìm kiếm tương đối theo tiêu đề hoặc đoạn trích ngắn (Full-text hoặc ILike)
    if (search) {
      queryBuilder.andWhere(
        '(blog.title ILIKE :search OR blog.excerpt ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    // Phân trang và Sắp xếp theo ngày xuất bản mới nhất
    queryBuilder
      .orderBy('blog.publishedAt', 'DESC')
      .skip(skip)
      .take(limit);

    const [posts, totalItems] = await queryBuilder.getManyAndCount();

    return {
      posts: posts.map((post) => ({
        id: post.id,
        slug: post.slug,
        category: post.category?.name || 'Uncategorized',
        title: post.title,
        excerpt: post.excerpt || '',
        image: post.coverImage || 'https://images.unsplash.com/photo-1599351431202-1e0f0137899a?w=600&q=80',
      })),
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalItems / limit),
        totalItems,
      },
    };
  }

  //List Blog Section
  async listBlogSection() {
    const dbPosts = await this.postRepo
      .createQueryBuilder('blog')
      .leftJoinAndSelect('blog.category', 'category')
      .select([
        'blog.id',
        'blog.slug',
        'blog.title',
        'blog.excerpt',
        'blog.coverImage',
        'blog.createdAt',
        'category.name', 
      ])
      .where('blog.status = :status', { status: PostStatus.PUBLISHED })
      .orderBy('blog.createdAt', 'DESC') 
      .take(3)
      .getMany();

    const formattedPosts = dbPosts.map((post) => ({
      id: post.id,
      slug: post.slug,
      category: post.category?.name || 'Uncategorized',
      title: post.title,
      excerpt: post.excerpt || '',
      image: post.coverImage || 'https://images.unsplash.com/photo-1599351431202-1e0f0137899a?w=600&q=80',
    }));

    return {
      posts: formattedPosts,
    };
  }

  //Lấy data cho sidebar blog
  async findAllTags() {
    return await this.tagRepo.find({
      select: ['id', 'name', 'slug'], 
      order: { name: 'ASC' }
    });
  }
  async findAllCategories() {
    return await this.categoryRepo.find({
      select: ['id', 'name', 'slug'],
      order: { name: 'ASC' }
    });
  }
  async findTopRecentPosts() {
    const posts = await this.postRepo.find({
      select: ['id', 'slug', 'title', 'coverImage', 'createdAt'], 
      where: { status: PostStatus.PUBLISHED },
      order: { createdAt: 'DESC' },
      take: 4,
    });

    return posts.map(post => ({
      id: post.id,
      slug: post.slug,
      title: post.title,
      image: post.coverImage || 'https://images.unsplash.com/photo-1599351431202-1e0f0137899a?w=600&q=80',
      createdAt: post.createdAt,
    }));
  }
  async getSidebarMetadata() {
    const [categories, tags, recentPosts] = await Promise.all([
      this.findAllCategories(),
      this.findAllTags(),
      this.findTopRecentPosts(), 
    ]);

    return {
      categories,
      tags,
      recentPosts,
    };
  }

  async create(dto: CreateBlogPostDto): Promise<Blog> {
    const { slug, categoryId, authorId, tagIds = [], content, status, publishedAt, ...rest } = dto;

    // Kiểm tra slug trùng 
    const existed = await this.postRepo.findOne({ where: { slug } });
    if (existed) {
      throw new ConflictException(`Slug "${slug}" đã tồn tại`);
    }

    // Validate category 
    const category = await this.categoryRepo.findOne({ where: { id: categoryId } });
    if (!category) {
      throw new NotFoundException(`Category id=${categoryId} không tồn tại`);
    }

    // Validate author 
    let author: BlogAuthor | null = null;
    if (authorId) {
      author = await this.authorRepo.findOne({ where: { id: authorId } });
      if (!author) {
        throw new NotFoundException(`Author id=${authorId} không tồn tại`);
      }
    }

    // Validate tags
    let tags: BlogTag[] = [];
    if (tagIds.length > 0) {
      const uniqueTagIds = [...new Set(tagIds)];
      tags = await this.tagRepo.find({ where: { id: In(uniqueTagIds) } });

      if (tags.length !== uniqueTagIds.length) {
        const foundIds = tags.map((t) => t.id);
        const missingIds = uniqueTagIds.filter((id) => !foundIds.includes(id));
        throw new BadRequestException(`Tag ids không tồn tại: [${missingIds.join(', ')}]`);
      }
    }

    // Auto set publishedAt khi status = published
    const resolvedStatus = status ?? PostStatus.DRAFT;
    const resolvedPublishedAt =
      resolvedStatus === PostStatus.PUBLISHED
        ? publishedAt ? new Date(publishedAt) : new Date()
        : null;

    // Tạo và lưu post 
    const post = this.postRepo.create({
      slug,
      content: content as ContentBlock[],
      category,
      author,
      tags,
      status: resolvedStatus,
      publishedAt: resolvedPublishedAt,
      ...rest,
    });

    return this.postRepo.save(post);
  }

  async getBySlug(slug: string): Promise<BlogPostResponseDto> {
    const post = await this.postRepo.findOne({
      where: { slug, status: PostStatus.PUBLISHED },
      relations: ['category', 'author', 'tags'],
    });

    if (!post) throw new NotFoundException(`Bài viết "${slug}" không tồn tại`);

    return {
      id: post.id,
      slug: post.slug,
      title: post.title,
      excerpt: post.excerpt,
      coverImage: post.coverImage,
      readTime: post.readTime,
      status: post.status,
      publishedAt: post.publishedAt,
      content: post.content,
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,

      category: {
        id: post.category.id,
        name: post.category.name,
        slug: post.category.slug,
      },

      author: post.author
        ? {
          id: post.author.id,
          name: post.author.name,
          role: post.author.role,
          avatar: post.author.avatar,
        }
        : null,

      tags: post.tags.map((t) => ({
        id: t.id,
        name: t.name,
        slug: t.slug,
      })),
    };
  }

  findAll() {
    return `This action returns all blogs`;
  }

  findOne(id: number) {
    return `This action returns a #${id} blog`;
  }

  update(id: number, updateBlogDto: UpdateBlogDto) {
    return `This action updates a #${id} blog`;
  }

  remove(id: number) {
    return `This action removes a #${id} blog`;
  }
}
