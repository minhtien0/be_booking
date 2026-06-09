import {
  Entity, PrimaryGeneratedColumn, Column,
  ManyToOne, ManyToMany, JoinTable, JoinColumn,
  CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';
import { BlogAuthor }   from './blog-author.entity';
import { BlogCategory } from './blog-category.entity';
import { BlogTag }      from './blog-tag.entity';

// ── Content block types (stored as JSONB) ─────────────────────────────────
export type ContentBlockType =
  | 'paragraph'
  | 'heading'
  | 'image'
  | 'list'
  | 'quote'
  | 'tip'
  | 'divider';

export interface ParagraphBlock {
  type: 'paragraph';
  text: string;
}

export interface HeadingBlock {
  type: 'heading';
  level: 2 | 3 | 4;
  text: string;
}

export interface ImageBlock {
  type: 'image';
  src: string;
  alt: string;
  caption?: string;
}

export interface ListBlock {
  type: 'list';
  style: 'bullet' | 'ordered';
  items: string[];
}

export interface QuoteBlock {
  type: 'quote';
  text: string;
  author?: string;
}

export interface TipBlock {
  type: 'tip';
  text: string;
}

export interface DividerBlock {
  type: 'divider';
}

export type ContentBlock =
  | ParagraphBlock
  | HeadingBlock
  | ImageBlock
  | ListBlock
  | QuoteBlock
  | TipBlock
  | DividerBlock;

// ── Post status ───────────────────────────────────────────────────────────
export enum PostStatus {
  DRAFT     = 'draft',
  PUBLISHED = 'published',
  ARCHIVED  = 'archived',
}

// ─────────────────────────────────────────────────────────────────────────────

@Entity('blogs')
@Index(['slug'], { unique: true })
@Index(['status', 'publishedAt'])       
export class BlogPost {
  @PrimaryGeneratedColumn()
  id: number;

  // ── Core fields ──────────────────────────────────────────────────────────

  @Column({ type: 'varchar', length: 255, unique: true, nullable: false })
  slug: string;

  @Column({ type: 'varchar', length: 255, nullable: false })
  title: string;

  @Column({ type: 'text', nullable: true })
  excerpt: string | null;

  @Column({ name: 'cover_image', type: 'varchar', length: 500, nullable: true })
  coverImage: string | null;

  @Column({ name: 'read_time', type: 'varchar', length: 50, nullable: true })
  readTime: string | null;               // e.g. "6 min read"

  // ── Content (JSONB — flexible block-based) ───────────────────────────────

  @Column({ type: 'jsonb', default: [] })
  content: ContentBlock[];

  // ── Status & publish date ─────────────────────────────────────────────────

  @Column({
    type: 'enum',
    enum: PostStatus,
    default: PostStatus.DRAFT,
  })
  status: PostStatus;

  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt: Date | null;

  // ── Relations ─────────────────────────────────────────────────────────────

  @ManyToOne(() => BlogCategory, (cat) => cat.posts, {
    eager: false,
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'category_id' })
  category: BlogCategory;

  @ManyToOne(() => BlogAuthor, (author) => author.posts, {
    eager: false,
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'author_id' })
  author: BlogAuthor | null;

  @ManyToMany(() => BlogTag, (tag) => tag.posts, { cascade: true })
  @JoinTable({
    name: 'blog_post_tags',
    joinColumn:        { name: 'post_id',    referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'tag_id',     referencedColumnName: 'id' },
  })
  tags: BlogTag[];

  // ── Timestamps ────────────────────────────────────────────────────────────

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}