import { IsEmail, IsIn, IsOptional, IsString, Length, Matches } from 'class-validator';

export class RegisterDto {
    @IsString()
    @Length(2, 100)
    name: string;

    @IsEmail()
    @Matches(/^[a-z0-9](\.?[a-z0-9]){5,}@gmail\.com$/)
    email: string;

    @IsString()
    @Length(8, 15)
    password: string;

    @IsOptional()
    @IsString()
    @Length(10)
    phoneNumber?: string;

    @IsOptional()
    @IsString()
    @Length(2)
    gender?: string;

    @IsOptional()
    @IsIn(['Customer', 'Staff', 'Admin'])
    role?: 'Customer' | 'Staff' | 'Admin' = 'Customer';

    @IsOptional()
    @IsIn(['Active'])
    status?: 'Active';
}