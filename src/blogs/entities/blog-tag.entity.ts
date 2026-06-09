import { Entity, PrimaryGeneratedColumn, Column, ManyToMany } from 'typeorm';
import { Blog } from './blog.entity';

@Entity('blog_tags')
export class BlogTag {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 100, unique: true, nullable: false })
  name: string;

  @Column({ type: 'varchar', length: 100, unique: true, nullable: false })
  slug: string;

  @ManyToMany(() => Blog, (post) => post.tags)
  posts: Blog[];
}