import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { Blog } from './blog.entity';

@Entity('blog_authors')
export class BlogAuthor {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 100, nullable: false })
  name: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  role: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  avatar: string | null;

  @OneToMany(() => Blog, (post) => post.author)
  posts: Blog[];
}