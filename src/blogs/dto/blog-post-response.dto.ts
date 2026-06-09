// dto/blog-post-response.dto.ts
import { ContentBlock }  from '../entities/blog.entity';
import { PostStatus }    from '../entities/blog.entity';

export class BlogPostResponseDto {
  id:           number;
  slug:         string;
  title:        string;
  excerpt:      string | null;
  coverImage:   string | null;
  readTime:     string | null;
  status:       PostStatus;
  publishedAt:  Date | null;
  content:      ContentBlock[];

  category: {
    id:   number;
    name: string;
    slug: string;
  };

  author: {
    id:     number;
    name:   string;
    role:   string | null;
    avatar: string | null;
  } | null;

  tags: {
    id:   number;
    name: string;
    slug: string;
  }[];

  createdAt: Date;
  updatedAt: Date;
}