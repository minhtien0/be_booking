import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { Blog } from './blog.entity';

@Entity('blog_categories')
export class BlogCategory {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 100, unique: true, nullable: false })
  name: string;

  @Column({ type: 'varchar', length: 100, unique: true, nullable: false })
  slug: string;

  @OneToMany(() => Blog, (post) => post.category)
  posts: Blog[];
}